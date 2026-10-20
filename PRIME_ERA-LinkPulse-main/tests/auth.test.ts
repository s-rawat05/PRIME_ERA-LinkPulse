import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditLog, users } from "@/db/schema";
import { abuseAlerts, addBlockedDomain, listAudit, updateUser } from "@/lib/admin/service";
import { authenticate, changePassword, createSession, deleteSession, registerUser, userFromToken } from "@/lib/auth/users";
import { adminSetDisabled, createLink } from "@/lib/links/service";
import { classifyUserAgent } from "@/lib/redirect/classify";
import { db, makeUser } from "./helpers";

describe("authentication", () => {
  it("registers with a hashed password and authenticates", async () => {
    const d = await db();
    const u = await registerUser(d, { name: "Asha", email: "Asha@Example.com", password: "correct-horse" });
    expect(u.email).toBe("asha@example.com");
    expect(u.role).toBe("user");
    const [row] = await d.select().from(users).where(eq(users.id, u.id));
    expect(row.passwordHash).toMatch(/^\$2/);
    expect(await authenticate(d, { email: "asha@example.com", password: "correct-horse" })).toMatchObject({ id: u.id });
    expect(await authenticate(d, { email: "asha@example.com", password: "wrong" })).toBeNull();
    expect(await authenticate(d, { email: "nobody@example.com", password: "whatever" })).toBeNull();
  });

  it("rejects duplicate emails and weak passwords", async () => {
    const d = await db();
    await registerUser(d, { name: "A", email: "dup@example.com", password: "password1" });
    await expect(registerUser(d, { name: "B", email: "DUP@example.com", password: "password1" })).rejects.toMatchObject({ status: 409 });
    await expect(registerUser(d, { name: "C", email: "c@example.com", password: "short" })).rejects.toMatchObject({ status: 400 });
  });

  it("sessions resolve to users, can be revoked, and die when the user is disabled", async () => {
    const d = await db();
    const admin = await makeUser("admin");
    const u = await makeUser();
    const s = await createSession(d, u.id);
    expect(await userFromToken(d, s.token)).toMatchObject({ id: u.id });
    expect(await userFromToken(d, "forged-token")).toBeNull();
    await deleteSession(d, s.token);
    expect(await userFromToken(d, s.token)).toBeNull();
    const s2 = await createSession(d, u.id);
    await updateUser(d, admin, u.id, { disabled: true });
    expect(await userFromToken(d, s2.token)).toBeNull();
    expect(await authenticate(d, { email: u.email, password: "password123" })).toBeNull();
  });

  it("password change requires the current password", async () => {
    const d = await db();
    const u = await makeUser();
    await expect(changePassword(d, u.id, "wrong-one", "newpassword1")).rejects.toMatchObject({ status: 400 });
    await changePassword(d, u.id, "password123", "newpassword1");
    expect(await authenticate(d, { email: u.email, password: "newpassword1" })).toMatchObject({ id: u.id });
  });
});

describe("authorization of administrative actions", () => {
  it("non-admins cannot take down links, manage the blocklist or users", async () => {
    const d = await db();
    const u = await makeUser();
    const other = await makeUser();
    const { link } = await createLink(d, other, { destinationUrl: "https://example.com" });
    await expect(adminSetDisabled(d, u, link.id, true, "nope")).rejects.toMatchObject({ status: 403 });
    await expect(addBlockedDomain(d, u, { domain: "example.com" })).rejects.toMatchObject({ status: 403 });
    await expect(updateUser(d, u, other.id, { role: "admin" })).rejects.toMatchObject({ status: 403 });
  });

  it("admin takedowns are audited with actor and reason", async () => {
    const d = await db();
    const admin = await makeUser("admin");
    const u = await makeUser();
    const { link } = await createLink(d, u, { destinationUrl: "https://example.com" });
    await adminSetDisabled(d, admin, link.id, true, "Phishing");
    const rows = await d.select().from(auditLog).where(eq(auditLog.targetId, link.id));
    const entry = rows.find((r) => r.action === "admin.link_disable");
    expect(entry).toMatchObject({ actorId: admin.id });
    expect(entry!.after).toMatchObject({ status: "disabled", reason: "Phishing" });
    expect((await listAudit(d, { q: "admin.link_disable" })).length).toBeGreaterThan(0);
    await expect(abuseAlerts(d)).resolves.toHaveProperty("signals");
  });

  it("admins cannot demote themselves", async () => {
    const d = await db();
    const admin = await makeUser("admin");
    await expect(updateUser(d, admin, admin.id, { role: "user" })).rejects.toMatchObject({ status: 400 });
  });

  it("audit entries never contain password hashes", async () => {
    const d = await db();
    const u = await makeUser();
    const { link } = await createLink(d, u, { destinationUrl: "https://example.com", password: "topsecret" });
    const [entry] = await d.select().from(auditLog).where(eq(auditLog.targetId, link.id));
    expect(JSON.stringify(entry.after)).not.toMatch(/\$2[aby]\$/);
  });
});

describe("bot classification table", () => {
  it.each([
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", true],
    ["facebookexternalhit/1.1", true],
    ["Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", true],
    ["WhatsApp/2.23.20.0 A", true],
    ["TelegramBot (like TwitterBot)", true],
    ["Discordbot/2.0", true],
    ["curl/8.4.0", true],
    ["python-requests/2.31", true],
    ["", true],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", false],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", false],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36", false],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", false],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0", false],
  ])("%s -> bot=%s", (ua, bot) => {
    expect(classifyUserAgent(ua).isBot).toBe(bot);
  });

  it("parses device class for humans", () => {
    expect(classifyUserAgent("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1").device).toBe("tablet");
    expect(classifyUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36")).toMatchObject({ device: "mobile", os: "Android", browser: "Chrome" });
  });
});
