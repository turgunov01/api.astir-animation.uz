function elapsedMs(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

// One JSON line per request (with time and duration), a record in the
// in-memory API monitor and, with the response body, in the request journal
// behind the admin "Отладка API" page.
import { buildJournalEntry, shouldCapture } from "../services/requestJournal.js";

export function createRequestLogger({ monitor = null, journal = null } = {}) {
  return function requestLogger(request, response, next) {
    const startedAt = process.hrtime.bigint();
    // CORS preflights are browser plumbing, not API calls.
    const preflight = request.method === "OPTIONS";
    const capture = !preflight && Boolean(journal) && shouldCapture(request.originalUrl || request.url);
    let responseBody;

    if (capture) {
      const send = response.send.bind(response);
      response.send = (body) => {
        // Files and streams are not kept, only what the API answers as data.
        if (responseBody === undefined && (typeof body === "string" || Buffer.isBuffer(body) || (body && typeof body === "object"))) {
          const type = String(response.getHeader("content-type") || "");
          responseBody = !type || /json|text/.test(type) ? body : `[${type}, ${Buffer.byteLength(body || "")} байт]`;
        }
        return send(body);
      };
    }

    response.on("finish", () => {
      const durationMs = Number(elapsedMs(startedAt).toFixed(1));
      const url = request.originalUrl || request.url;

      console.info(JSON.stringify({
        time: new Date().toISOString(),
        method: request.method,
        url,
        statusCode: response.statusCode,
        durationMs
      }));

      if (!preflight) monitor?.record({
        at: Date.now(),
        method: request.method,
        url: url.split("?")[0],
        route: request.monitorRoute || null,
        status: response.statusCode,
        ms: durationMs,
        requestId: request.id || null,
        message: request.errorMessage || null
      });

      if (capture) journal.add(buildJournalEntry({ request, response, responseBody, durationMs }));
    });

    next();
  };
}
