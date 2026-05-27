export class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function badRequest(message, code = "BAD_REQUEST") {
  return new AppError(400, code, message);
}

export function unauthorized(message = "Unauthorized", code = "UNAUTHORIZED") {
  return new AppError(401, code, message);
}

export function forbidden(message = "Forbidden", code = "FORBIDDEN") {
  return new AppError(403, code, message);
}

export function notFound(message = "Not found", code = "NOT_FOUND") {
  return new AppError(404, code, message);
}

export function conflict(message, code = "CONFLICT") {
  return new AppError(409, code, message);
}

export function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}
