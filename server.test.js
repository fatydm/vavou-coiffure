const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createServer } = require("./server");
const vercelHandler = require("./api/reservations");

const samplePayload = {
  prestation: "Coupe femme",
  duree: 45,
  prix: 42,
  coiffeur: "Anaïs Martin",
  dateHeure: "2026-11-28T10:30:00",
  nom: "Léa Martin",
  telephone: "06 00 00 00 00",
  email: "lea@exemple.fr"
};

function postReservation(server, payload) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path: "/api/reservations",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    });
    request.on("error", reject);
    request.end(JSON.stringify(payload));
  });
}

async function withServer(options, callback) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await callback(server);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function invokeVercelHandler(handler, payload) {
  const response = {
    headers: {},
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
      return this;
    },
    end(body = "") {
      this.body = body;
    }
  };

  return Promise.resolve(handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload
  }, response)).then(() => ({
    status: response.statusCode,
    body: JSON.parse(response.body)
  }));
}

test("sends the exact Make JSON, including local time and text telephone", async () => {
  let received;
  await withServer({
    webhookUrl: "https://make.invalid/simulated-webhook",
    apiKey: "test-only-key",
    fetchImpl: async (url, options) => {
      received = { url, options };
      return new Response(JSON.stringify({ reference: "TEST-RESERVATION-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  }, async (server) => {
    const result = await postReservation(server, samplePayload);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: "confirmed", reference: "TEST-RESERVATION-1" });
  });

  assert.equal(received.url, "https://make.invalid/simulated-webhook");
  assert.equal(received.options.headers["x-make-apikey"], "test-only-key");
  assert.equal(received.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(received.options.body), samplePayload);
  assert.deepEqual(Object.keys(JSON.parse(received.options.body)), [
    "prestation", "duree", "prix", "coiffeur", "dateHeure", "nom", "telephone", "email"
  ]);
  assert.equal(typeof JSON.parse(received.options.body).telephone, "string");
});

test("Vercel function accepts the parsed JSON body and uses the configured secret", async () => {
  let received;
  const handler = vercelHandler.createHandler({
    webhookUrl: "https://make.invalid/simulated-webhook",
    apiKey: "test-only-key",
    fetchImpl: async (url, options) => {
      received = { url, options };
      return new Response(JSON.stringify({ reservationReference: "TEST-VERCEL-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  const result = await invokeVercelHandler(handler, samplePayload);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { status: "confirmed", reference: "TEST-VERCEL-1" });
  assert.equal(received.options.headers["x-make-apikey"], "test-only-key");
  assert.deepEqual(JSON.parse(received.options.body), samplePayload);
});

test("reports a received request without claiming it is confirmed", async () => {
  await withServer({
    webhookUrl: "https://make.invalid/simulated-webhook",
    apiKey: "test-only-key",
    fetchImpl: async () => new Response(JSON.stringify({ accepted: true }), { status: 200 })
  }, async (server) => {
    const result = await postReservation(server, {
      ...samplePayload,
      coiffeur: "Sans préférence"
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: "received" });
  });
});

test("rejects client-supplied catalog changes without calling Make", async () => {
  let called = false;
  await withServer({
    webhookUrl: "https://make.invalid/simulated-webhook",
    apiKey: "test-only-key",
    fetchImpl: async () => {
      called = true;
      return new Response(null, { status: 200 });
    }
  }, async (server) => {
    const result = await postReservation(server, { ...samplePayload, prix: 1 });
    assert.equal(result.status, 400);
    assert.match(result.body.message, /catalogue/);
  });
  assert.equal(called, false);
});
