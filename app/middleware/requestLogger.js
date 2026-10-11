function elapsedMs(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

// One JSON line per request (with time and duration) and a record in the
// in-memory API monitor behind the admin "Отладка API" page.
export function createRequestLogger({ monitor = null } = {}) {
  return function requestLogger(request, response, next) {
    const startedAt = process.hrtime.bigint();

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

      monitor?.record({
        at: Date.now(),
        method: request.method,
        url: url.split("?")[0],
        route: request.monitorRoute || null,
        status: response.statusCode,
        ms: durationMs,
        requestId: request.id || null,
        message: request.errorMessage || null
      });
    });

    next();
  };
}
