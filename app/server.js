import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { assertSecureConfig } from "./config.js";
import { createContainer } from "./bootstrap/createContainer.js";
import { createAnalyticsRoutes } from "./legacy/analyticsRoutes.js";
import { createLegacyDb, requireLegacyDb } from "./legacy/db.js";
import { createLegacyMedia } from "./legacy/media.js";
import { createMediaThumbnailHandler } from "./legacy/mediaThumbnails.js";
import { createLegacyRoutes } from "./legacy/routes.js";
import { createLegacySwaggerForRequest } from "./legacy/swagger.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { requestContext } from "./middleware/requestContext.js";
import { createRequestLogger } from "./middleware/requestLogger.js";
import { detectClient } from "./services/requestJournal.js";
import { openApiDocument } from "./openapi.js";
import { createBillingRoutes } from "./routes/billingRoutes.js";
import { createRoutes } from "./routes/index.js";
import { createSecureMedia } from "./lib/secureMedia.js";
import { createSwaggerIndexPage } from "./swagger/indexPage.js";
import { swaggerScopes } from "./swagger/scopedDocs.js";
import { createSwaggerUiOptions } from "./swagger/uiTheme.js";

function buildCors(appConfig) {
  const allowList = appConfig.cors?.origins || [];

  if (allowList.length === 0) {
    // No allow-list configured: keep the previous permissive behaviour so nothing
    // breaks in dev. assertSecureConfig() warns about this in production.
    return cors();
  }

  return cors({
    origin(origin, callback) {
      // Allow non-browser clients (no Origin header) and allow-listed origins only.
      if (!origin || allowList.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true
  });
}

export function createApp({ container = createContainer() } = {}) {
  // Fail fast on an insecure production configuration before serving anything.
  assertSecureConfig();

  const app = express();

  // Trust the nginx reverse proxy so req.ip is the real client (needed for
  // correct per-client rate limiting and TLS awareness).
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(createRequestLogger({ monitor: container.services.apiMonitor, journal: container.services.requestJournal }));
  app.use(helmet({
    // Swagger UI (inline assets) and cross-origin media need these relaxed;
    // the other helmet defaults (HSTS, nosniff, frameguard, etc.) stay enabled.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false
  }));
  app.use(buildCors(container.config));
  app.use(express.json({ limit: "1mb" }));

  // Video is served only through signed, expiring links (and only as a
  // preview for locked premium titles). Without a secret the old open
  // /media keeps working, so a misconfigured server doesn't go dark.
  const secureMedia = process.env.MEDIA_SIGNING_SECRET
    ? createSecureMedia({ secret: process.env.MEDIA_SIGNING_SECRET, mediaRoot: container.config.mediaRoot })
    : null;
  if (secureMedia) app.use(secureMedia.signJsonResponses);

  // Payment providers: the app asks which ones to offer, and new payments
  // through a provider the admin switched off are refused.
  app.use(container.services.presence.middleware());

  const paymentProviders = container.services.paymentProviders;
  app.get(["/v1/billing/providers", "/api/v1/billing/providers"], async (request, response, next) => {
    try {
      response.json({ providers: await paymentProviders.publicList() });
    } catch (error) {
      next(error);
    }
  });
  app.use(paymentProviders.guard());

  // Public project config for the mobile apps (API address, versions,
  // maintenance, feature switches, contacts). Cached briefly by clients.
  const projectSettings = container.services.projectSettings;
  app.get(["/v1/app-config", "/api/v1/app-config"], async (request, response, next) => {
    try {
      response.set("Cache-Control", "public, max-age=60");
      projectSettings.recordFetch(detectClient(request.headers), request.get("x-app-version"));
      response.json(await projectSettings.publicConfig(`https://${request.get("host")}`));
    } catch (error) {
      next(error);
    }
  });
  app.use(express.urlencoded({ extended: false }));

  const legacyDb = container.searchDb || createLegacyDb();
  const legacyMedia = createLegacyMedia({
    mediaRoot: container.config.mediaRoot,
    signingSecret: process.env.MEDIA_SIGNING_SECRET
  });

  app.get("/health", (request, response) => {
    response.status(200).json({ status: "ok" });
  });

  // Public privacy policy page; the Google Play listing links here.
  const privacyPolicyPath = fileURLToPath(new URL("./public/privacy-policy.html", import.meta.url));
  app.get(["/privacy", "/privacy-policy"], (request, response) => {
    response.set("Cache-Control", "public, max-age=3600");
    response.sendFile(privacyPolicyPath);
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

  // Images (posters, avatars, chat files) stay public static; video paths are
  // refused here unless they come through a signed /media/s/<token>/ link
  // (security/findings.md #4). No dotfiles, no directory index.
  if (secureMedia) app.use("/media", secureMedia.handler, secureMedia.guard);
  app.use("/media", express.static(path.resolve(container.config.mediaRoot), {
    dotfiles: "deny",
    index: false
  }));

  // On-demand cached thumbnails for /media images (posters) so list views load
  // small images instead of full-resolution originals.
  app.use("/media-thumb", createMediaThumbnailHandler({
    mediaRoot: container.config.mediaRoot,
    ffmpegPath: container.config.ffmpegPath
  }));

  const legacyRoutes = createLegacyRoutes({
    childContentBlacklist: container.repositories.childContentBlacklist,
    config: container.config,
    contentCategories: container.repositories.contentCategories,
    contentLikes: container.repositories.contentLikes,
    contentMovies: container.repositories.contentMovies,
    contentPurge: container.services.contentPurge,
    apiMonitor: container.services.apiMonitor,
    notificationService: container.services.notifications,
    requestJournal: container.services.requestJournal,
    projectSettings: container.services.projectSettings,
    contentService: container.services.content,
    devices: container.repositories.devices,
    media: legacyMedia,
    paymentProviders: container.services.paymentProviders,
    streaming: container.services.legacyStreaming,
    subscriptions: container.repositories.subscriptions,
    tariffs: container.repositories.tariffs,
    tariffService: container.services.tariffs,
    tariffStoreSync: container.services.tariffStoreSync,
    watchLimits: container.repositories.watchLimits,
    watchSessions: container.repositories.watchSessions
  });
  const analyticsRoutes = createAnalyticsRoutes({
    contentMovies: container.repositories.contentMovies,
    contentReactions: container.repositories.contentReactions,
    watchSessions: container.repositories.watchSessions,
    devices: container.repositories.devices,
    children: container.repositories.children
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

  // Brute-force / abuse protection on the sensitive auth surfaces. Payment
  // callbacks are intentionally NOT limited (provider retries must get through).
  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
  });
  const otpRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use(["/v1/auth/otp", "/api/v1/auth/otp"], otpRateLimiter);
  app.use(["/v1/auth", "/api/v1/auth"], authRateLimiter);

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
