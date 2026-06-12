function firstHeaderValue(value) {
  return String(value || "").split(",")[0].trim();
}

function elapsedMs(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

export function requestLogger(request, response, next) {
  const startedAt = process.hrtime.bigint();

  response.on("finish", () => {
    const contentLength = response.getHeader("content-length");

    if (request.statusCode >= 400) {
      console.info(JSON.stringify({
        // event: "http_request",
        // requestId: request.id || null,
        method: request.method,
        url: request.originalUrl || request.url,
        statusCode: response.statusCode,
        // durationMs: Number(elapsedMs(startedAt).toFixed(2)),
        ip: firstHeaderValue(request.get("x-forwarded-for")) || request.ip || request.socket?.remoteAddress || "",
        userAgent: request.get("user-agent") || "",
        // referer: request.get("referer") || request.get("referrer") || "",
        // contentLength: contentLength === undefined ? null : Number(contentLength)
      }));
    };

  });

  next();
}
