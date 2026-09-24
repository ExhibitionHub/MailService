import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";

function fixture() {
  const messages = [];
  const transporter = {
    async sendMail(message) {
      messages.push(message);
      return { messageId: "test-message-id" };
    },
  };
  const app = createApp({
    transporter,
    config: {
      trustProxyHops: 0,
      corsOrigins: "*",
      apiKeys: ["test-key"],
      maxAttachmentBytes: 1024,
      maxRecipients: 3,
      rateLimitWindowMs: 60_000,
      mailRateLimit: 10_000,
      maxConcurrentSends: 3,
      maxQueuedSends: 3,
      sendQueueTimeoutMs: 1000,
      fromAddress: "no-reply@example.test",
      fromName: "Exhibition Hub",
    },
  });
  return { app, messages };
}

test("envoie un email texte via le transport SMTP", async () => {
  const { app, messages } = fixture();
  const response = await request(app)
    .post("/v1/emails")
    .set("authorization", "Bearer test-key")
    .send({ to: "visitor@example.com", subject: "Votre dinosaure", text: "Bonjour !" })
    .expect(202);

  assert.deepEqual(response.body, { ok: true, messageId: "test-message-id" });
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].to, ["visitor@example.com"]);
  assert.deepEqual(messages[0].from, { name: "Exhibition Hub", address: "no-reply@example.test" });
});

test("transmet une pièce jointe base64", async () => {
  const { app, messages } = fixture();
  await request(app)
    .post("/v1/emails")
    .set("x-api-key", "test-key")
    .send({
      to: ["visitor@example.com"],
      subject: "Image",
      html: "<p>Votre image</p>",
      attachments: [{ filename: "dino.png", contentType: "image/png", contentBase64: Buffer.from("image").toString("base64") }],
    })
    .expect(202);

  assert.equal(messages[0].attachments[0].filename, "dino.png");
  assert.equal(messages[0].attachments[0].content.toString(), "image");
});

test("refuse un appel sans clé API", async () => {
  const { app } = fixture();
  await request(app)
    .post("/v1/emails")
    .send({ to: "visitor@example.com", subject: "Test", text: "Bonjour" })
    .expect(401);
});

test("valide les destinataires et le contenu", async () => {
  const { app } = fixture();
  await request(app)
    .post("/v1/emails")
    .set("x-api-key", "test-key")
    .send({ to: "not-an-email", subject: "Test", text: "Bonjour" })
    .expect(400);
  await request(app)
    .post("/v1/emails")
    .set("x-api-key", "test-key")
    .send({ to: "visitor@example.com", subject: "Test" })
    .expect(400);
});

test("refuse proprement une demande quand la capacité SMTP est atteinte", async () => {
  let releaseFirst;
  let notifyStarted;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  const transporter = {
    async sendMail() {
      notifyStarted();
      return new Promise((resolve) => { releaseFirst = () => resolve({ messageId: "first" }); });
    },
  };
  const app = createApp({
    transporter,
    config: {
      trustProxyHops: 0,
      corsOrigins: "*",
      apiKeys: ["test-key"],
      maxAttachmentBytes: 1024,
      maxRecipients: 3,
      rateLimitWindowMs: 60_000,
      mailRateLimit: 10_000,
      maxConcurrentSends: 1,
      maxQueuedSends: 0,
      sendQueueTimeoutMs: 1000,
      fromAddress: "no-reply@example.test",
      fromName: "Exhibition Hub",
    },
  });
  const payload = { to: "visitor@example.com", subject: "Test", text: "Bonjour" };
  const first = request(app).post("/v1/emails").set("x-api-key", "test-key").send(payload);
  const firstResult = first.then((response) => response);
  await started;
  const overloaded = await request(app).post("/v1/emails").set("x-api-key", "test-key").send(payload).expect(503);
  assert.equal(overloaded.body.error, "overloaded");
  releaseFirst();
  assert.equal((await firstResult).status, 202);
});
