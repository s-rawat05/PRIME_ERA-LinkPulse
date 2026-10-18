import { describe, expect, it } from "vitest";
import { evaluate, type EvalRequest, type LinkSnapshot } from "@/lib/redirect/engine";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const link = (o: Partial<LinkSnapshot> = {}): LinkSnapshot => ({
  id: "l1", shortCode: "abc", destinationUrl: "https://example.com/", status: "active", blocked: false, disabledReason: null,
  expiresAt: null, expiredUrl: null, maxClicks: null, clickCount: 0, hasPassword: false, rules: [], ...o,
});
const req = (o: Partial<EvalRequest> = {}): EvalRequest => ({ now: NOW, isBot: false, device: "desktop", os: "Windows", country: "IN", password: "none", ...o });

describe("rule engine order", () => {
  it("1. unknown code -> not_found 404", () => {
    const e = evaluate(null, req());
    expect(e.decision).toMatchObject({ kind: "block", outcome: "not_found", status: 404 });
    expect(e.steps).toHaveLength(9);
    expect(e.steps.slice(1).every((s) => s.result === "skip")).toBe(true);
  });

  it("2. disabled overrides paused, expired, password and cap", () => {
    const e = evaluate(link({ status: "disabled", expiresAt: NOW - 1, hasPassword: true, maxClicks: 1, clickCount: 5 }), req({ password: "wrong" }));
    expect(e.decision).toMatchObject({ outcome: "disabled", status: 410 });
  });

  it("2. blocklisted destination is treated as disabled", () => {
    expect(evaluate(link({ blocked: true }), req()).decision).toMatchObject({ outcome: "disabled" });
  });

  it("3. paused is checked before expiry", () => {
    expect(evaluate(link({ status: "paused", expiresAt: NOW - 1 }), req()).decision).toMatchObject({ outcome: "paused" });
  });

  it("4. expiry is checked before password (no password prompt on a dead link)", () => {
    expect(evaluate(link({ expiresAt: NOW - 1, hasPassword: true }), req()).decision).toMatchObject({ outcome: "expired", status: 410 });
    expect(evaluate(link({ expiresAt: NOW }), req()).decision.outcome).toBe("expired");
    expect(evaluate(link({ expiresAt: NOW + 1 }), req()).decision.outcome).toBe("redirected");
  });

  it("4. expired link with fallback URL redirects to the fallback", () => {
    const e = evaluate(link({ expiresAt: NOW - 1, expiredUrl: "https://example.com/over" }), req());
    expect(e.decision).toMatchObject({ kind: "redirect_expired", outcome: "expired", destination: "https://example.com/over" });
  });

  it("5. password: form without attempt, failure on wrong, pass on correct", () => {
    expect(evaluate(link({ hasPassword: true }), req()).decision).toMatchObject({ kind: "password", outcome: null });
    expect(evaluate(link({ hasPassword: true }), req({ password: "wrong" })).decision).toMatchObject({ kind: "password", outcome: "password_failed" });
    expect(evaluate(link({ hasPassword: true }), req({ password: "correct" })).decision.outcome).toBe("redirected");
  });

  it("5. wrong password never reaches the cap step", () => {
    const e = evaluate(link({ hasPassword: true, maxClicks: 10 }), req({ password: "wrong", simulateCap: true }));
    expect(e.steps[6].result).toBe("skip");
    expect(e.decision.kind).toBe("password");
  });

  it("6. bots are redirected but never consume the cap", () => {
    const e = evaluate(link({ maxClicks: 1, clickCount: 1 }), req({ isBot: true, device: "bot", simulateCap: true }));
    expect(e.decision).toMatchObject({ kind: "redirect", outcome: "bot", consumeCap: false });
  });

  it("7. cap: consumes below the limit, blocks at the limit (simulation)", () => {
    expect(evaluate(link({ maxClicks: 10, clickCount: 9 }), req({ simulateCap: true })).decision).toMatchObject({ outcome: "redirected", consumeCap: true });
    expect(evaluate(link({ maxClicks: 10, clickCount: 10 }), req({ simulateCap: true })).decision).toMatchObject({ outcome: "limit_reached" });
  });

  it("7. live mode defers the cap to the atomic DB update", () => {
    expect(evaluate(link({ maxClicks: 10, clickCount: 10 }), req()).decision).toMatchObject({ outcome: "redirected", consumeCap: true });
  });

  it("8. targeting: first matching rule by priority wins, blocked rules are skipped", () => {
    const rules = [
      { id: "r2", priority: 2, conditionType: "device" as const, conditionValue: "mobile", targetUrl: "https://m.example.com/" },
      { id: "r1", priority: 1, conditionType: "country" as const, conditionValue: "in", targetUrl: "https://in.example.com/" },
      { id: "r0", priority: 0, conditionType: "os" as const, conditionValue: "android", targetUrl: "https://bad.example.com/", blocked: true },
    ];
    const e = evaluate(link({ rules }), req({ device: "mobile", os: "Android", country: "IN" }));
    expect(e.decision).toMatchObject({ destination: "https://in.example.com/", ruleId: "r1" });
    const e2 = evaluate(link({ rules }), req({ device: "mobile", country: "US" }));
    expect(e2.decision).toMatchObject({ destination: "https://m.example.com/", ruleId: "r2" });
    const e3 = evaluate(link({ rules }), req({ device: "desktop", country: "US" }));
    expect(e3.decision).toMatchObject({ destination: "https://example.com/", ruleId: null });
  });

  it("9. produces a full 9-step trace for a successful redirect", () => {
    const e = evaluate(link(), req());
    expect(e.steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(e.steps.every((s) => s.result !== "block")).toBe(true);
  });
});
