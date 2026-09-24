import { timingSafeEqual } from "node:crypto";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { CapacityGate } from "./capacity.js";

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

class RequestError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function safeEqual(received, expected) {
  const left = Buffer.from(received || "");
  const right = Buffer.from(expected || "");
  return left.length === right.length && timingSafeEqual(left, right);
}

function authorization(config) {
  return (request, response, next) => {
    const keys = config.apiKeys || (config.apiKey ? [config.apiKey] : []);
    if (!keys.length) return next();
    const bearer = request.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    const key = request.get("x-api-key") || bearer;
    if (!keys.some((candidate) => safeEqual(key, candidate))) {
      return response.status(401).json({ error: "unauthorized", message: "Clé API absente ou invalide." });
    }
    return next();
  };
}

function corsOptions(origins) {
  if (origins === "*") return { origin: true, credentials: false };
  return {
    origin(origin, callback) {
      callback(null, !origin || origins.includes(origin));
    },
  };
}

function requiredText(value, field, maxLength) {
  if (typeof value !== "string") throw new RequestError("invalid_request", `${field} est obligatoire.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\r\n]/.test(normalized)) {
    throw new RequestError("invalid_request", `${field} est invalide.`);
  }
  return normalized;
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new RequestError("invalid_request", `${field} est invalide.`);
  }
  return value;
}

function email(value, field) {
  const normalized = requiredText(value, field, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) throw new RequestError("invalid_email", `${field} n'est pas une adresse valide.`);
  return normalized;
}

function emailList(value, field, maxRecipients, { required = false } = {}) {
  const source = value === undefined || value === null ? [] : (Array.isArray(value) ? value : [value]);
  if ((required && source.length === 0) || source.length > maxRecipients) {
    throw new RequestError("invalid_recipients", `${field} doit contenir entre ${required ? 1 : 0} et ${maxRecipients} adresses.`);
  }
  return [...new Set(source.map((item) => email(item, field)))];
}

function attachments(value, maxBytes) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) {
    throw new RequestError("invalid_attachments", "attachments doit contenir au maximum 8 fichiers.");
  }
  let total = 0;
  return value.map((attachment, index) => {
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
      throw new RequestError("invalid_attachments", `Pièce jointe ${index + 1} invalide.`);
    }
    const filename = requiredText(attachment.filename, `attachments[${index}].filename`, 180);
    if (/[\\/]/.test(filename)) throw new RequestError("invalid_attachments", "Le nom d'une pièce jointe ne peut pas contenir de chemin.");
    const contentBase64 = requiredText(attachment.contentBase64, `attachments[${index}].contentBase64`, Math.ceil(maxBytes * 4 / 3) + 4);
    if (!BASE64_PATTERN.test(contentBase64)) throw new RequestError("invalid_attachments", `Pièce jointe ${index + 1} : base64 invalide.`);
    const content = Buffer.from(contentBase64, "base64");
    total += content.length;
    if (total > maxBytes) throw new RequestError("attachments_too_large", `Les pièces jointes dépassent ${maxBytes} octets.`, 413);
    const contentType = attachment.contentType === undefined
      ? "application/octet-stream"
      : requiredText(attachment.contentType, `attachments[${index}].contentType`, 120);
    return { filename, content, contentType };
  });
}

function overloadProtection(gate) {
  return async (_request, response, next) => {
    try {
      const release = await gate.acquire();
      response.once("finish", release);
      response.once("close", release);
      next();
    } catch (error) {
      response.set("Retry-After", "5");
      response.status(503).json({ error: error.code || "overloaded", message: error.message });
    }
  };
}

function mailLimiter(config) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.mailRateLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({ error: "rate_limited", message: "Trop d'envois depuis cette adresse. Réessayez plus tard." });
    },
  });
}

export function createApp({ config, transporter }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxyHops ? config.trustProxyHops : false);
  app.use(helmet());
  app.use(cors(corsOptions(config.corsOrigins)));
  const sendGate = new CapacityGate({
    maxActive: config.maxConcurrentSends,
    maxQueued: config.maxQueuedSends,
    waitTimeoutMs: config.sendQueueTimeoutMs,
  });

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "mail-service", smtpConfigured: true, sends: sendGate.stats() });
  });

  app.post(
    "/v1/emails",
    mailLimiter(config),
    authorization(config),
    overloadProtection(sendGate),
    express.json({ limit: `${Math.ceil(config.maxAttachmentBytes * 1.5 / 1024 / 1024) + 1}mb` }),
    async (request, response, next) => {
      try {
        const body = request.body || {};
        const to = emailList(body.to, "to", config.maxRecipients, { required: true });
        const cc = emailList(body.cc, "cc", config.maxRecipients);
        const bcc = emailList(body.bcc, "bcc", config.maxRecipients);
        if (to.length + cc.length + bcc.length > config.maxRecipients) {
          throw new RequestError("too_many_recipients", `Maximum ${config.maxRecipients} destinataires au total.`);
        }
        const subject = requiredText(body.subject, "subject", 200);
        const text = optionalText(body.text, "text", 100_000);
        const html = optionalText(body.html, "html", 200_000);
        if (!text && !html) throw new RequestError("invalid_request", "text ou html est obligatoire.");
        const replyTo = body.replyTo ? email(body.replyTo, "replyTo") : undefined;
        const files = attachments(body.attachments, config.maxAttachmentBytes);

        const result = await transporter.sendMail({
          from: { name: config.fromName, address: config.fromAddress },
          to,
          ...(cc.length ? { cc } : {}),
          ...(bcc.length ? { bcc } : {}),
          ...(replyTo ? { replyTo } : {}),
          subject,
          ...(text ? { text } : {}),
          ...(html ? { html } : {}),
          ...(files.length ? { attachments: files } : {}),
          disableFileAccess: true,
          disableUrlAccess: true,
        });

        response.status(202).json({ ok: true, messageId: result.messageId || null });
      } catch (error) {
        next(error);
      }
    },
  );

  app.use((_request, response) => {
    response.status(404).json({ error: "not_found", message: "Route inconnue." });
  });
  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && error.type === "entity.parse.failed") {
      return response.status(400).json({ error: "invalid_json", message: "JSON invalide." });
    }
    if (error.type === "entity.too.large") {
      return response.status(413).json({ error: "request_too_large", message: "Requête trop volumineuse." });
    }
    const status = error.status || 502;
    if (status >= 500) console.error("Échec SMTP:", error.message);
    return response.status(status).json({
      error: error.code || "mail_delivery_failed",
      message: status >= 500 ? "Le serveur SMTP n'a pas accepté le message." : error.message,
    });
  });
  return app;
}
