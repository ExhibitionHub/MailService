import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createTransporter } from "./mailer.js";

const config = loadConfig();
const transporter = createTransporter(config);
const app = createApp({ config, transporter });

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`MailService écoute sur http://0.0.0.0:${config.port}`);
});
server.requestTimeout = config.requestTimeoutMs;
server.headersTimeout = Math.min(config.requestTimeoutMs, 15_000);
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 1_000;

function shutdown(signal) {
  console.log(`${signal} reçu, arrêt de MailService.`);
  server.close(async (error) => {
    transporter.close();
    process.exit(error ? 1 : 0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
