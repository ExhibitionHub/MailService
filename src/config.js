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

export function loadConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const fromAddress = process.env.MAIL_FROM?.trim();
  if (!host) throw new Error("SMTP_HOST est obligatoire.");
  if (!fromAddress) throw new Error("MAIL_FROM est obligatoire.");

  return {
    port: integer("PORT", 3102, { min: 1, max: 65535 }),
    trustProxy: boolean("TRUST_PROXY", true),
    corsOrigins: origins(),
    apiKey: process.env.MAIL_API_KEY?.trim() || null,
    maxAttachmentBytes: integer("MAX_ATTACHMENT_BYTES", 10 * 1024 * 1024, {
      min: 1024,
      max: 25 * 1024 * 1024,
    }),
    maxRecipients: integer("MAX_RECIPIENTS", 10, { min: 1, max: 50 }),
    fromAddress,
    fromName: process.env.MAIL_FROM_NAME?.trim() || "Exhibition Hub",
    smtp: {
      host,
      port: integer("SMTP_PORT", 587, { min: 1, max: 65535 }),
      secure: boolean("SMTP_SECURE", false),
      requireTLS: boolean("SMTP_REQUIRE_TLS", false),
      rejectUnauthorized: boolean("SMTP_REJECT_UNAUTHORIZED", true),
      user: process.env.SMTP_USER?.trim() || null,
      pass: process.env.SMTP_PASS || null,
    },
  };
}
