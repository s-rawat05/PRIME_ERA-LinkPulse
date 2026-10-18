/**
 * LinkPulse redirect rule engine.
 *
 * `evaluate()` is a pure function: given a link snapshot and a description of the request it
 * returns the decision plus a step-by-step trace. It performs no I/O, so both the real
 * redirect handler and the rule simulator call exactly the same code.
 *
 * Fixed rule order:
 *   1 resolve code        -> not_found
 *   2 admin disabled / blocked destination -> disabled
 *   3 paused by owner     -> paused
 *   4 expired             -> expired (optional fallback URL)
 *   5 password            -> password_required / password_failed (before the cap, so failures never use clicks)
 *   6 bot / link preview  -> bot (redirected, never counted, never consumes the cap)
 *   7 click cap           -> limit_reached (enforced atomically in the DB by the caller)
 *   8 targeting rules     -> first matching rule by priority, else default destination
 *   9 302 redirect        -> redirected
 */

export type Outcome =
  | "redirected"
  | "not_found"
  | "disabled"
  | "paused"
  | "expired"
  | "password_failed"
  | "limit_reached"
  | "bot";

export type DeviceType = "desktop" | "mobile" | "tablet" | "bot" | "unknown";

export type RuleSnapshot = {
  id: string;
  priority: number;
  conditionType: "device" | "os" | "country";
  conditionValue: string;
  targetUrl: string;
  /** Target host is on the blocklist; such rules are skipped so traffic falls back to the default. */
  blocked?: boolean;
};

export type LinkSnapshot = {
  id: string;
  shortCode: string;
  destinationUrl: string;
  status: "active" | "paused" | "disabled";
  /** Destination host is on the domain blocklist. */
  blocked: boolean;
  disabledReason: string | null;
  expiresAt: number | null; // epoch ms
  expiredUrl: string | null;
  maxClicks: number | null;
  /** Click count at snapshot time. Only used in simulation; live caps are enforced atomically in SQL. */
  clickCount: number;
  hasPassword: boolean;
  rules: RuleSnapshot[];
};

export type EvalRequest = {
  now: number;
  isBot: boolean;
  device: DeviceType;
  os: string | null;
  country: string | null;
  /** "none" = no password submitted, otherwise whether the submitted password matched. */
  password: "none" | "correct" | "wrong";
  /** Simulation evaluates the cap against the snapshot count instead of deferring to the DB. */
  simulateCap?: boolean;
};

export type StepResult = "pass" | "block" | "route" | "skip";
export type Step = { n: number; name: string; result: StepResult; detail: string };

export type Decision =
  | { kind: "redirect"; outcome: "redirected" | "bot"; destination: string; ruleId: string | null; consumeCap: boolean }
  | { kind: "redirect_expired"; outcome: "expired"; destination: string }
  | { kind: "password"; outcome: "password_failed" | null; error: boolean }
  | { kind: "block"; outcome: Exclude<Outcome, "redirected" | "bot" | "password_failed">; status: number };

export type Evaluation = { decision: Decision; steps: Step[] };

export const STEP_NAMES = [
  "Resolve short code",
  "Admin-disabled / blocked domain",
  "Paused by owner",
  "Expiry",
  "Password",
  "Bot / link-preview detection",
  "Click cap",
  "Targeting rules",
  "302 redirect",
] as const;

function matches(rule: RuleSnapshot, req: EvalRequest): boolean {
  const v = rule.conditionValue.trim().toLowerCase();
  switch (rule.conditionType) {
    case "device":
      return req.device === v;
    case "os":
      return !!req.os && req.os.toLowerCase().includes(v);
    case "country":
      return !!req.country && req.country.toLowerCase() === v;
  }
}

export function evaluate(link: LinkSnapshot | null, req: EvalRequest): Evaluation {
  const steps: Step[] = [];
  const push = (n: number, result: StepResult, detail: string) => steps.push({ n, name: STEP_NAMES[n - 1], result, detail });
  const finish = (decision: Decision): Evaluation => {
    for (let n = steps.length + 1; n <= 9; n++) push(n, "skip", "Not evaluated: an earlier rule decided the outcome.");
    return { decision, steps };
  };

  // 1. Resolve
  if (!link) {
    push(1, "block", "No link exists for this code.");
    return finish({ kind: "block", outcome: "not_found", status: 404 });
  }
  push(1, "pass", `Found link /${link.shortCode}.`);

  // 2. Safety overrides every other state
  if (link.status === "disabled") {
    push(2, "block", `Disabled by an administrator${link.disabledReason ? `: ${link.disabledReason}` : "."}`);
    return finish({ kind: "block", outcome: "disabled", status: 410 });
  }
  if (link.blocked) {
    push(2, "block", "Destination domain is on the platform blocklist.");
    return finish({ kind: "block", outcome: "disabled", status: 410 });
  }
  push(2, "pass", "Not disabled and destination is not blocklisted.");

  // 3. Paused (reversible owner switch)
  if (link.status === "paused") {
    push(3, "block", "The owner has paused this link.");
    return finish({ kind: "block", outcome: "paused", status: 403 });
  }
  push(3, "pass", "Link is active.");

  // 4. Expiry, checked before the password so nobody is asked for a password on a dead link
  if (link.expiresAt !== null && req.now >= link.expiresAt) {
    if (link.expiredUrl) {
      push(4, "route", `Expired at ${new Date(link.expiresAt).toISOString()}; sending visitor to the expiry fallback URL.`);
      return finish({ kind: "redirect_expired", outcome: "expired", destination: link.expiredUrl });
    }
    push(4, "block", `Expired at ${new Date(link.expiresAt).toISOString()}.`);
    return finish({ kind: "block", outcome: "expired", status: 410 });
  }
  push(4, "pass", link.expiresAt ? `Valid until ${new Date(link.expiresAt).toISOString()}.` : "No expiry set.");

  // 5. Password, checked before the cap so failed attempts never consume clicks
  if (link.hasPassword) {
    if (req.password === "none") {
      push(5, "block", "Password required; showing the password form (no click consumed).");
      return finish({ kind: "password", outcome: null, error: false });
    }
    if (req.password === "wrong") {
      push(5, "block", "Incorrect password (no click consumed).");
      return finish({ kind: "password", outcome: "password_failed", error: true });
    }
    push(5, "pass", "Correct password supplied.");
  } else {
    push(5, "pass", "No password required.");
  }

  // 6. Bots are redirected but never counted and never consume the cap
  const isBot = req.isBot || req.device === "bot";

  // 8. Targeting (computed here so bots and humans see the same routing)
  const ordered = [...link.rules].sort((a, b) => a.priority - b.priority);
  const matched = ordered.find((r) => !r.blocked && matches(r, req)) ?? null;
  const destination = matched ? matched.targetUrl : link.destinationUrl;
  const routeDetail = matched
    ? `Rule #${matched.priority} matched (${matched.conditionType} = ${matched.conditionValue}).`
    : ordered.length
      ? "No rule matched; using the default destination."
      : "No targeting rules; using the default destination.";

  if (isBot) {
    push(6, "route", "Bot or link-preview user agent: redirected but not counted as a click.");
    push(7, "skip", "Bots never consume the click cap.");
    push(8, matched ? "route" : "pass", routeDetail);
    push(9, "pass", `302 → ${destination} (logged as bot).`);
    return { decision: { kind: "redirect", outcome: "bot", destination, ruleId: matched?.id ?? null, consumeCap: false }, steps };
  }
  push(6, "pass", "Human visitor.");

  // 7. Click cap
  let consumeCap = false;
  if (link.maxClicks !== null) {
    if (req.simulateCap) {
      if (link.clickCount >= link.maxClicks) {
        push(7, "block", `Click cap reached (${link.clickCount}/${link.maxClicks}).`);
        return finish({ kind: "block", outcome: "limit_reached", status: 410 });
      }
      push(7, "pass", `Would consume click ${link.clickCount + 1} of ${link.maxClicks}.`);
    } else {
      push(7, "pass", `Capped at ${link.maxClicks}; click consumed with one atomic conditional UPDATE.`);
    }
    consumeCap = true;
  } else {
    push(7, "pass", "No click cap.");
  }

  push(8, matched ? "route" : "pass", routeDetail);
  push(9, "pass", `302 → ${destination}`);
  return { decision: { kind: "redirect", outcome: "redirected", destination, ruleId: matched?.id ?? null, consumeCap }, steps };
}
