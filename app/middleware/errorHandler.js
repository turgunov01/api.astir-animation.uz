import { AppError } from "../lib/errors.js";

export function notFoundHandler(request, response) {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
      requestId: request.id
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
        message: "Request body must be valid JSON",
        requestId: request.id
      }
    });
    return;
  }

  if (
    error.name === "MulterError" ||
    error.message === "Only video files are allowed" ||
    error.message === "Only image files are allowed" ||
    error.message === "Unsupported upload field"
  ) {
    response.status(400).json({
      error: {
        code: "UPLOAD_ERROR",
        message: error.message,
        requestId: request.id
      }
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      error: {
        code: error.code,
        message: error.message,
        requestId: request.id
      }
    });
    return;
  }

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      requestId: request.id
    }
  });
}
