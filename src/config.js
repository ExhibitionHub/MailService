import "dotenv/config";

function integer(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} doit être un entier entre ${min} et ${max}.`);
  }
  return value;
}

function boolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (["1", "true", "yes", "on"].includes(raw.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(raw.toLowerCase())) return false;
  throw new Error(`${name} doit être un booléen.`);
}

function origins() {
  const raw = process.env.CORS_ORIGINS?.trim() || "*";
  if (raw === "*") return "*";
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function apiKeys() {
  const combined = [process.env.MAIL_API_KEY, process.env.MAIL_API_KEYS]
    .filter(Boolean)
    .join(",");
  return [...new Set(combined.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function loadConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const fromAddress = process.env.MAIL_FROM?.trim();
  if (!host) throw new Error("SMTP_HOST est obligatoire.");
  if (!fromAddress) throw new Error("MAIL_FROM est obligatoire.");
  const keys = apiKeys();
  if (process.env.NODE_ENV === "production" && keys.length === 0) {
    throw new Error("MAIL_API_KEY ou MAIL_API_KEYS est obligatoire en production.");
  }

  return {
    port: integer("PORT", 3102, { min: 1, max: 65535 }),
    trustProxyHops: integer("TRUST_PROXY_HOPS", 1, { min: 0, max: 10 }),
    corsOrigins: origins(),
    apiKeys: keys,
    maxAttachmentBytes: integer("MAX_ATTACHMENT_BYTES", 10 * 1024 * 1024, {
      min: 1024,
      max: 25 * 1024 * 1024,
    }),
    maxRecipients: integer("MAX_RECIPIENTS", 10, { min: 1, max: 50 }),
    rateLimitWindowMs: integer("RATE_LIMIT_WINDOW_MS", 60_000, { min: 1000, max: 3_600_000 }),
    mailRateLimit: integer("MAIL_RATE_LIMIT", 120, { min: 1, max: 100_000 }),
    maxConcurrentSends: integer("MAX_CONCURRENT_SENDS", 10, { min: 1, max: 1000 }),
    maxQueuedSends: integer("MAX_QUEUED_SENDS", 200, { min: 0, max: 10_000 }),
    sendQueueTimeoutMs: integer("SEND_QUEUE_TIMEOUT_MS", 5000, { min: 100, max: 120_000 }),
    requestTimeoutMs: integer("REQUEST_TIMEOUT_MS", 30_000, { min: 1000, max: 300_000 }),
    fromAddress,
    fromName: process.env.MAIL_FROM_NAME?.trim() || "Exhibition Hub",
    smtp: {
      host,
      port: integer("SMTP_PORT", 587, { min: 1, max: 65535 }),
      secure: boolean("SMTP_SECURE", false),
      requireTLS: boolean("SMTP_REQUIRE_TLS", false),
      rejectUnauthorized: boolean("SMTP_REJECT_UNAUTHORIZED", true),
      poolConnections: integer("SMTP_POOL_CONNECTIONS", 10, { min: 1, max: 100 }),
      connectionTimeoutMs: integer("SMTP_CONNECTION_TIMEOUT_MS", 10_000, { min: 1000, max: 120_000 }),
      socketTimeoutMs: integer("SMTP_SOCKET_TIMEOUT_MS", 20_000, { min: 1000, max: 300_000 }),
      user: process.env.SMTP_USER?.trim() || null,
      pass: process.env.SMTP_PASS || null,
    },
  };
}
