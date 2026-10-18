export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const unauthorized = () => new AppError(401, "unauthorized", "Please sign in to continue.");
export const forbidden = (msg = "You do not have permission to do that.") => new AppError(403, "forbidden", msg);
export const notFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found.`);
export const badRequest = (msg: string, fields?: Record<string, string>) => new AppError(400, "invalid", msg, fields);
export const conflict = (msg: string, fields?: Record<string, string>) => new AppError(409, "conflict", msg, fields);
export const tooMany = (msg = "Too many requests. Please slow down and try again shortly.") => new AppError(429, "rate_limited", msg);

/** Postgres unique_violation, optionally for a specific constraint. Works for pg and PGlite errors. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  let e: unknown = err;
  for (let i = 0; i < 3 && e; i++) {
    const x = e as { code?: string; constraint?: string; cause?: unknown };
    if (x.code === "23505") return !constraint || x.constraint === constraint;
    e = x.cause;
  }
  return false;
}
