type PendingRequest = {
  key: string;
  fingerprint: string;
};

const memoryFallback = new Map<string, PendingRequest>();
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

const canonicalStringify = (value: unknown): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(String(value));
};

const fallbackHash = (value: string) => {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
};

export const createRequestFingerprint = async (value: unknown) => {
  const serialized = canonicalStringify(value);
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return fallbackHash(serialized);
};

export const createRequestIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `request-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

const isPendingRequest = (value: unknown): value is PendingRequest => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.key === 'string'
    && IDEMPOTENCY_KEY_PATTERN.test(candidate.key)
    && typeof candidate.fingerprint === 'string'
    && candidate.fingerprint.length >= 16
    && candidate.fingerprint.length <= 128;
};

export const readPendingRequest = (storageKey: string): PendingRequest | null => {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isPendingRequest(parsed)) {
        memoryFallback.set(storageKey, parsed);
        return parsed;
      }
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Browsers may disable sessionStorage. The in-memory fallback still keeps
    // retries idempotent for the lifetime of this page.
  }
  return memoryFallback.get(storageKey) ?? null;
};

export const writePendingRequest = (storageKey: string, request: PendingRequest) => {
  memoryFallback.set(storageKey, request);
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(request));
  } catch {
    // See readPendingRequest: storage can be unavailable in restricted modes.
  }
};

export const clearPendingRequest = (storageKey: string) => {
  memoryFallback.delete(storageKey);
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Nothing else to clear when storage is unavailable.
  }
};
