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
      trustProxy: false,
      corsOrigins: "*",
      apiKey: "test-key",
      maxAttachmentBytes: 1024,
      maxRecipients: 3,
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
