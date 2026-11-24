const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const MAX_BODY_BYTES = 10 * 1024;
const SLOT_TIMES = new Set([
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"
]);
const SERVICES = new Map([
  ["Coupe femme", { duration: 45, price: 42, pole: "Coupe & Brushing" }],
  ["Coupe homme", { duration: 30, price: 28, pole: "Coupe & Brushing" }],
  ["Brushing", { duration: 30, price: 25, pole: "Coupe & Brushing" }],
  ["Couleur racine", { duration: 75, price: 55, pole: "Couleur & Technique" }],
  ["Balayage", { duration: 150, price: 95, pole: "Couleur & Technique" }],
  ["Coupe barbe", { duration: 20, price: 18, pole: "Barbier" }],
  ["Coupe + barbe", { duration: 45, price: 40, pole: "Barbier" }]
]);
const PROFESSIONALS = new Map([
  ["Anaïs Martin", "Coupe & Brushing"],
  ["Jade Laurent", "Coupe & Brushing"],
  ["Lina Bernard", "Couleur & Technique"],
  ["Sarah Petit", "Couleur & Technique"],
  ["Karim Moreau", "Barbier"]
]);
const PAYLOAD_KEYS = [
  "prestation",
  "duree",
  "prix",
  "coiffeur",
  "dateHeure",
  "nom",
  "telephone",
  "email"
];

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function getParisDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validateDateTime(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00$/.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const date = `${yearText}-${monthText}-${dayText}`;
  const time = `${hourText}:${minuteText}`;

  return calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day
    && date >= getParisDate()
    && SLOT_TIMES.has(time);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Le formulaire est invalide.";
  }
  const keys = Object.keys(payload);
  if (keys.length !== PAYLOAD_KEYS.length || PAYLOAD_KEYS.some((key) => !Object.hasOwn(payload, key))) {
    return "Le formulaire est incomplet ou contient des champs inattendus.";
  }

  const service = SERVICES.get(payload.prestation);
  if (!service || payload.duree !== service.duration || payload.prix !== service.price) {
    return "La prestation, sa durée ou son tarif ne correspond pas au catalogue.";
  }

  if (payload.coiffeur !== "Sans préférence" && PROFESSIONALS.get(payload.coiffeur) !== service.pole) {
    return "Ce professionnel n’est pas qualifié pour la prestation choisie.";
  }

  if (!validateDateTime(payload.dateHeure)) {
    return "Choisissez une date et un horaire proposés par le formulaire.";
  }

  if (typeof payload.nom !== "string" || payload.nom.trim().length < 2 || payload.nom.length > 120) {
    return "Le nom renseigné est invalide.";
  }

  if (typeof payload.telephone !== "string" || payload.telephone.replace(/\D/g, "").length !== 10) {
    return "Le numéro de téléphone doit contenir 10 chiffres.";
  }

  if (typeof payload.email !== "string"
      || payload.email.length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
    return "L’adresse e-mail est invalide.";
  }

  return null;
}

async function readJsonBody(request) {
  const contentType = request.headers["content-type"] || request.headers["Content-Type"];
  if (!contentType?.toLowerCase().startsWith("application/json")) {
    throw Object.assign(new Error("Le corps de la requête doit être au format JSON."), { statusCode: 415 });
  }

  if (request.body !== undefined) {
    if (typeof request.body === "object" && request.body !== null && !Buffer.isBuffer(request.body)) {
      return request.body;
    }

    const body = Buffer.isBuffer(request.body) ? request.body.toString("utf8") : String(request.body);
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Le formulaire est trop volumineux."), { statusCode: 413 });
    }
    try {
      return JSON.parse(body);
    } catch {
      throw Object.assign(new Error("Le formulaire JSON est invalide."), { statusCode: 400 });
    }
  }

  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Le formulaire est trop volumineux."), { statusCode: 413 });
    }
  }

  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error("Le formulaire JSON est invalide."), { statusCode: 400 });
  }
}

function parseWebhookReference(responseBody) {
  if (!responseBody || typeof responseBody !== "object" || Array.isArray(responseBody)) return null;
  const reference = responseBody.reference ?? responseBody.reservationReference;
  return typeof reference === "string" && reference.trim() ? reference.trim() : null;
}

async function handleReservation(request, response, config) {
  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    return sendJson(response, error.statusCode || 400, { message: error.message });
  }

  const validationError = validatePayload(payload);
  if (validationError) return sendJson(response, 400, { message: validationError });

  if (!config.webhookUrl || !config.apiKey) {
    return sendJson(response, 503, {
      message: "La réservation en ligne n’est pas configurée. Réessayez plus tard."
    });
  }

  const webhookPayload = {
    prestation: payload.prestation,
    duree: SERVICES.get(payload.prestation).duration,
    prix: SERVICES.get(payload.prestation).price,
    coiffeur: payload.coiffeur,
    dateHeure: payload.dateHeure,
    nom: payload.nom.trim(),
    telephone: payload.telephone.trim(),
    email: payload.email.trim()
  };

  let webhookResponse;
  try {
    webhookResponse = await config.fetchImpl(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-make-apikey": config.apiKey
      },
      body: JSON.stringify(webhookPayload),
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    return sendJson(response, 502, {
      message: "Impossible de joindre le service de réservation. Vérifiez votre connexion et réessayez."
    });
  }

  if (!webhookResponse.ok) {
    return sendJson(response, 502, {
      message: "Le service de réservation n’a pas accepté la demande. Réessayez."
    });
  }

  let webhookBody = null;
  try {
    webhookBody = await webhookResponse.json();
  } catch {
    webhookBody = null;
  }

  const reference = parseWebhookReference(webhookBody);
  if (reference) {
    return sendJson(response, 200, { status: "confirmed", reference });
  }

  return sendJson(response, 200, { status: "received" });
}

function serveStatic(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    return response.end();
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    return response.end();
  }

  if (pathname === "/") pathname = "/index.html";
  if (!/^\/(?:index\.html|app\.js|styles\.css|assets\/[A-Za-z0-9._-]+)$/.test(pathname)) {
    response.writeHead(404);
    return response.end("Not found");
  }

  const filePath = path.join(ROOT, pathname.slice(1));
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404);
    return response.end("Not found");
  }

  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".jpeg": "image/jpeg"
  };
  response.writeHead(200, {
    "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-cache"
  });
  if (request.method === "HEAD") return response.end();
  fs.createReadStream(filePath).pipe(response);
}

function createServer(options = {}) {
  const config = {
    webhookUrl: options.webhookUrl ?? process.env.MAKE_BOOKING_WEBHOOK_URL,
    apiKey: options.apiKey ?? process.env.MAKE_BOOKING_API_KEY,
    fetchImpl: options.fetchImpl ?? fetch
  };

  return http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/api/reservations") {
      if (request.method !== "POST") {
        response.writeHead(405, { Allow: "POST" });
        return response.end();
      }
      return handleReservation(request, response, config);
    }

    return serveStatic(request, response);
  });
}

function createReservationHandler(options = {}) {
  const config = {
    webhookUrl: options.webhookUrl ?? process.env.MAKE_BOOKING_WEBHOOK_URL,
    apiKey: options.apiKey ?? process.env.MAKE_BOOKING_API_KEY,
    fetchImpl: options.fetchImpl ?? fetch
  };

  return (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405, { Allow: "POST" });
      return response.end();
    }
    return handleReservation(request, response, config);
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => {
    console.log(`Vavou Coiffure est disponible sur http://localhost:${port}`);
  });
}

module.exports = { createReservationHandler, createServer };
