import http from "node:http";
import path from "node:path";
import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { createContainer } from "./bootstrap/createContainer.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { requestContext } from "./middleware/requestContext.js";
import { openApiDocument } from "./openapi.js";
import { createRoutes } from "./routes/index.js";
import { createSwaggerIndexPage } from "./swagger/indexPage.js";
import { swaggerScopes } from "./swagger/scopedDocs.js";

export function createApp({ container = createContainer() } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);

  app.get("/health", (request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get(["/", "/index.html"], (request, response) => {
    response.type("html").send(createSwaggerIndexPage(swaggerScopes));
  });

  app.get("/openapi.json", (request, response) => {
    response.json(openApiDocument);
  });

  app.use("/media", express.static(path.resolve(container.config.mediaRoot)));

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  for (const scope of swaggerScopes) {
    app.get(scope.jsonPath, (request, response) => {
      response.json(scope.document);
    });
    app.use(
      scope.docsPath,
      swaggerUi.serveFiles(scope.document),
      swaggerUi.setup(scope.document)
    );
  }

  app.use("/v1", createRoutes({
    controllers: container.controllers,
    middleware: container.middleware
  }));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export function createServer(options = {}) {
  return http.createServer(createApp(options));
}
