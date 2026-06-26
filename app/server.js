import http from "node:http";
import path from "node:path";
import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { createContainer } from "./bootstrap/createContainer.js";
import { createAnalyticsRoutes } from "./legacy/analyticsRoutes.js";
import { createLegacyDb, requireLegacyDb } from "./legacy/db.js";
import { createLegacyMedia } from "./legacy/media.js";
import { createLegacyRoutes } from "./legacy/routes.js";
import { createLegacySwaggerForRequest } from "./legacy/swagger.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { requestContext } from "./middleware/requestContext.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { openApiDocument } from "./openapi.js";
import { createBillingRoutes } from "./routes/billingRoutes.js";
import { createRoutes } from "./routes/index.js";
import { createSwaggerIndexPage } from "./swagger/indexPage.js";
import { swaggerScopes } from "./swagger/scopedDocs.js";
import { createSwaggerUiOptions } from "./swagger/uiTheme.js";

export function createApp({ container = createContainer() } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(requestLogger);
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  const legacyDb = container.searchDb || createLegacyDb();
  const legacyMedia = createLegacyMedia({
    mediaRoot: container.config.mediaRoot,
    signingSecret: process.env.MEDIA_SIGNING_SECRET
  });

  app.get("/health", (request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get(["/", "/index.html"], (request, response) => {
    response.type("html").send(createSwaggerIndexPage(swaggerScopes));
  });

  app.get("/openapi.json", (request, response) => {
    response.json(openApiDocument);
  });

  app.get("/legacy-doc.json", (request, response) => {
    response.json(createLegacySwaggerForRequest(request));
  });

  app.use("/media", express.static(path.resolve(container.config.mediaRoot)));

  const legacyRoutes = createLegacyRoutes({
    childContentBlacklist: container.repositories.childContentBlacklist,
    config: container.config,
    contentCategories: container.repositories.contentCategories,
    contentLikes: container.repositories.contentLikes,
    contentMovies: container.repositories.contentMovies,
    media: legacyMedia,
    tariffs: container.repositories.tariffs
  });
  const analyticsRoutes = createAnalyticsRoutes({
    contentMovies: container.repositories.contentMovies,
    contentReactions: container.repositories.contentReactions
  });

  const fullSwaggerOptions = createSwaggerUiOptions({
    document: openApiDocument,
    title: openApiDocument.info.title,
    description: openApiDocument.info.description,
    docsPath: "/api-docs",
    jsonPath: "/openapi.json",
    scopes: swaggerScopes
  });

  app.use(
    "/api-docs",
    swaggerUi.serveFiles(openApiDocument, fullSwaggerOptions),
    swaggerUi.setup(openApiDocument, fullSwaggerOptions)
  );

  app.use(
    "/legacy-api-docs",
    swaggerUi.serve,
    swaggerUi.setup(null, {
      customSiteTitle: "Astir Streaming API | Legacy Docs",
      swaggerOptions: {
        url: "/legacy-doc.json",
        displayRequestDuration: true,
        docExpansion: "list",
        filter: true,
        persistAuthorization: true,
        tryItOutEnabled: true
      }
    })
  );

  for (const scope of swaggerScopes) {
    const scopedSwaggerOptions = createSwaggerUiOptions({
      document: scope.document,
      title: scope.title,
      description: scope.description,
      docsPath: scope.docsPath,
      jsonPath: scope.jsonPath,
      scopes: swaggerScopes
    });

    app.get(scope.jsonPath, (request, response) => {
      response.json(scope.document);
    });
    app.use(
      scope.docsPath,
      swaggerUi.serveFiles(scope.document, scopedSwaggerOptions),
      swaggerUi.setup(scope.document, scopedSwaggerOptions)
    );
  }

  app.use("/v1", createRoutes({
    controllers: container.controllers,
    middleware: container.middleware
  }));

  app.use(
    "/v1",
    requireLegacyDb(legacyDb),
    legacyRoutes
  );

  app.use("/api/v1/billing", createBillingRoutes({
    authMiddleware: container.middleware.auth,
    billingController: container.controllers.billing
  }));

  app.use(
    "/api",
    requireLegacyDb(legacyDb),
    analyticsRoutes
  );

  app.use(
    "/api/v1",
    requireLegacyDb(legacyDb),
    legacyRoutes
  );
  
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export function createServer(options = {}) {
  return http.createServer(createApp(options));
}
