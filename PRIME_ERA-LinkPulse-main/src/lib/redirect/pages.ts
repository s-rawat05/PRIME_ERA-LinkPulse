import type { PageKind } from "./resolve";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const COPY: Record<PageKind, { title: string; body: string; icon: string }> = {
  not_found: { title: "Link not found", body: "This short link does not exist. Check the address for typos.", icon: "?" },
  disabled: { title: "Link unavailable", body: "This link has been disabled because it violates our usage policy or points to a blocked destination.", icon: "⛔" },
  paused: { title: "Link paused", body: "The owner has temporarily paused this link. Please try again later.", icon: "❚❚" },
  expired: { title: "Link expired", body: "This link has expired and no longer redirects.", icon: "⌛" },
  limit_reached: { title: "Click limit reached", body: "This link has reached its maximum number of visits.", icon: "∎" },
  password: { title: "Password required", body: "This link is protected. Enter the password to continue.", icon: "🔒" },
  rate_limited: { title: "Too many attempts", body: "Too many password attempts. Please wait a minute and try again.", icon: "⏱" },
};

/** Self-contained HTML so the hot path never renders React. */
export function renderStatusPage(kind: PageKind, code: string, opts: { error?: string; qr?: boolean } = {}) {
  const c = COPY[kind];
  const action = `/${encodeURIComponent(code)}${opts.qr ? "?s=qr" : ""}`;
  const form =
    kind === "password" || kind === "rate_limited"
      ? `<form method="post" action="${esc(action)}" class="form">
          <label for="pw">Password</label>
          <input id="pw" name="password" type="password" required autocomplete="current-password" autofocus ${kind === "rate_limited" ? "disabled" : ""}/>
          ${opts.error ? `<p class="err" role="alert">${esc(opts.error)}</p>` : ""}
          <button type="submit" ${kind === "rate_limited" ? "disabled" : ""}>Unlock link</button>
        </form>`
      : `<a class="home" href="/">Go to LinkPulse</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/>
<title>${esc(c.title)} · LinkPulse</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
background:radial-gradient(1200px 600px at 50% -10%,#5aa2ff 0%,#2563eb 45%,#1e40af 100%);color:#0b1f4d;padding:16px}
.card{width:100%;max-width:420px;background:rgba(255,255,255,.88);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.7);border-radius:28px;padding:36px 32px;box-shadow:0 30px 80px -20px rgba(15,40,120,.45);text-align:center}
.icon{width:64px;height:64px;margin:0 auto 18px;border-radius:20px;display:grid;place-items:center;font-size:26px;background:linear-gradient(135deg,#e0ecff,#fff);box-shadow:inset 0 0 0 1px #dbe6ff}
h1{font-size:22px;margin:0 0 8px;letter-spacing:-.01em}p{margin:0;color:#475569;line-height:1.55;font-size:15px}
.code{display:inline-block;margin-top:14px;font:600 13px ui-monospace,monospace;color:#2563eb;background:#eef4ff;padding:4px 10px;border-radius:999px}
.form{margin-top:22px;text-align:left;display:grid;gap:10px}label{font-size:13px;font-weight:600;color:#334155}
input{width:100%;padding:12px 14px;border-radius:14px;border:1px solid #cbd5e1;font-size:15px;outline:none}input:focus{border-color:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.15)}
button,.home{display:inline-flex;justify-content:center;align-items:center;padding:12px 18px;border-radius:999px;border:0;background:#0b1220;color:#fff;font-weight:600;font-size:15px;cursor:pointer;text-decoration:none}
button:disabled{opacity:.5;cursor:not-allowed}.home{margin-top:24px}.err{color:#b91c1c;font-size:14px}
.brand{margin-top:22px;font-size:12px;color:#64748b}
</style></head><body><main class="card"><div class="icon" aria-hidden="true">${c.icon}</div>
<h1>${esc(c.title)}</h1><p>${esc(c.body)}</p><span class="code">/${esc(code)}</span>${form}
<p class="brand">Secured by LinkPulse</p></main></body></html>`;
}
