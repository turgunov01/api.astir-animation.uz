import { AppError } from "../lib/errors.js";

export function notFoundHandler(request, response) {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found"
    }
  });
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    response.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON"
      }
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error"
    }
  });
}
