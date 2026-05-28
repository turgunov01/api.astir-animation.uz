import { randomUUID } from "node:crypto";

export function requestContext(request, response, next) {
  const requestId = request.get("x-request-id") || randomUUID();

  request.id = requestId;
  response.set("x-request-id", requestId);

  next();
}
