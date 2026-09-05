import { NextFunction, Request, Response } from "express";

type RateEntry = { count: number; resetAt: number };
type RatePolicy = { key: string; limit: number; windowMs: number };
type ConsumedPolicy = RatePolicy & RateEntry;

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
  maximum: number,
) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
};

const SUBMISSION_WINDOW_MS = parsePositiveInteger(
  process.env.FORMULARIOS_RATE_LIMIT_WINDOW_MS,
  60_000,
  60 * 60 * 1000,
);
const SUBMISSION_FORM_MAX = parsePositiveInteger(
  process.env.FORMULARIOS_RATE_LIMIT_MAX,
  10,
  10_000,
);
const SUBMISSION_GLOBAL_MAX = parsePositiveInteger(
  process.env.FORMULARIOS_GLOBAL_RATE_LIMIT_MAX,
  60,
  20_000,
);
const QR_WINDOW_MS = parsePositiveInteger(
  process.env.FORMULARIOS_QR_RATE_LIMIT_WINDOW_MS,
  60_000,
  60 * 60 * 1000,
);
const QR_FORM_MAX = parsePositiveInteger(
  process.env.FORMULARIOS_QR_RATE_LIMIT_MAX,
  30,
  10_000,
);
const QR_GLOBAL_MAX = parsePositiveInteger(
  process.env.FORMULARIOS_QR_GLOBAL_RATE_LIMIT_MAX,
  60,
  20_000,
);
const MAX_TRACKED_KEYS = 40_000;

const entries = new Map<string, RateEntry>();
let requestsSinceSweep = 0;

const sweepExpiredEntries = (now: number) => {
  requestsSinceSweep += 1;
  if (requestsSinceSweep < 100 && entries.size < MAX_TRACKED_KEYS) return;
  requestsSinceSweep = 0;

  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) entries.delete(key);
  }

  while (entries.size >= MAX_TRACKED_KEYS) {
    const oldestKey = entries.keys().next().value as string | undefined;
    if (!oldestKey) break;
    entries.delete(oldestKey);
  }
};

const consumePolicy = (policy: RatePolicy, now: number): ConsumedPolicy => {
  const current = entries.get(policy.key);
  const entry: RateEntry =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + policy.windowMs }
      : current;
  entry.count += 1;
  entries.delete(policy.key);
  entries.set(policy.key, entry);
  return { ...policy, ...entry };
};

const applyPolicies = (
  req: Request,
  res: Response,
  next: NextFunction,
  kind: "submission" | "qr",
  formLimit: number,
  globalLimit: number,
  windowMs: number,
) => {
  const now = Date.now();
  sweepExpiredEntries(now);

  const publicId = req.params.publicId?.trim() || "unknown-form";
  const clientIp = (req.ip || req.socket.remoteAddress || "unknown-ip").trim();
  const policies = [
    consumePolicy(
      { key: `${kind}:form:${publicId}:${clientIp}`, limit: formLimit, windowMs },
      now,
    ),
    consumePolicy(
      { key: `${kind}:global:${clientIp}`, limit: globalLimit, windowMs },
      now,
    ),
  ];

  const exceeded = policies.filter((policy) => policy.count > policy.limit);
  const mostRestrictive = [...policies].sort(
    (left, right) =>
      Math.max(left.limit - left.count, 0) - Math.max(right.limit - right.count, 0),
  )[0];
  const resetSeconds = Math.max(
    Math.ceil((mostRestrictive.resetAt - now) / 1000),
    1,
  );
  res.setHeader("RateLimit-Limit", String(mostRestrictive.limit));
  res.setHeader(
    "RateLimit-Remaining",
    String(Math.max(mostRestrictive.limit - mostRestrictive.count, 0)),
  );
  res.setHeader("RateLimit-Reset", String(resetSeconds));

  if (exceeded.length > 0) {
    const retryAfter = Math.max(
      ...exceeded.map((policy) => Math.ceil((policy.resetAt - now) / 1000)),
      1,
    );
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      error: "Muitas tentativas. Aguarde um instante e tente novamente.",
      code: "RATE_LIMITED",
    });
    return;
  }

  next();
};

export const limitarSubmissoesFormulario = (
  req: Request,
  res: Response,
  next: NextFunction,
) =>
  applyPolicies(
    req,
    res,
    next,
    "submission",
    SUBMISSION_FORM_MAX,
    SUBMISSION_GLOBAL_MAX,
    SUBMISSION_WINDOW_MS,
  );

export const limitarGeracaoQrFormulario = (
  req: Request,
  res: Response,
  next: NextFunction,
) =>
  applyPolicies(
    req,
    res,
    next,
    "qr",
    QR_FORM_MAX,
    QR_GLOBAL_MAX,
    QR_WINDOW_MS,
  );
