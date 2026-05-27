import http from "node:http";
import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { openApiDocument } from "./openapi.js";
import { routes } from "./routes/index.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/openapi.json", (request, response) => {
    response.json(openApiDocument);
  });

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use("/v1", routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export function createServer() {
  return http.createServer(createApp());
}
