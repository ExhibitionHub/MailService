import nodemailer from "nodemailer";

export function createTransporter(config) {
  const options = {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    requireTLS: config.smtp.requireTLS,
    tls: { rejectUnauthorized: config.smtp.rejectUnauthorized },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  };
  if (config.smtp.user || config.smtp.pass) {
    if (!config.smtp.user || !config.smtp.pass) {
      throw new Error("SMTP_USER et SMTP_PASS doivent être définis ensemble.");
    }
    options.auth = { user: config.smtp.user, pass: config.smtp.pass };
  }
  return nodemailer.createTransport(options);
}
