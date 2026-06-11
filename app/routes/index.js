import { Router } from "express";
import { createAuthRoutes } from "./authRoutes.js";
import { createBillingRoutes } from "./billingRoutes.js";
import { createChildrenRoutes } from "./childrenRoutes.js";
import { createContentRoutes } from "./contentRoutes.js";
import { createDeviceRoutes } from "./deviceRoutes.js";
import { createFaqRoutes } from "./faqRoutes.js";
import { createNotificationRoutes } from "./notificationRoutes.js";
import { createPairingRoutes } from "./pairingRoutes.js";
import { createRecommendationRoutes } from "./recommendationRoutes.js";
import { createTariffRoutes } from "./tariffRoutes.js";
import { createWatchSessionRoutes } from "./watchSessionRoutes.js";

export function createRoutes({ controllers, middleware }) {
  const routes = Router();

  routes.use("/auth", createAuthRoutes({
    authController: controllers.auth,
    authMiddleware: middleware.auth
  }));
  routes.use("/billing", createBillingRoutes({
    authMiddleware: middleware.auth,
    billingController: controllers.billing
  }));
  routes.use("/children", createChildrenRoutes({
    authMiddleware: middleware.auth,
    childrenController: controllers.children
  }));
  routes.use("/pairing", createPairingRoutes({
    authMiddleware: middleware.auth,
    pairingController: controllers.pairing
  }));
  routes.use("/device", createDeviceRoutes({
    authMiddleware: middleware.auth,
    deviceController: controllers.device
  }));
  routes.use("/content", createContentRoutes({
    authMiddleware: middleware.auth,
    contentController: controllers.content,
    uploadMiddleware: middleware.upload
  }));
  routes.use("/faqs", createFaqRoutes({
    authMiddleware: middleware.auth,
    faqController: controllers.faqs
  }));
  routes.use("/recommendations", createRecommendationRoutes({
    authMiddleware: middleware.auth,
    recommendationController: controllers.recommendations
  }));
  routes.use("/notifications", createNotificationRoutes({
    authMiddleware: middleware.auth,
    notificationController: controllers.notifications
  }));
  routes.use("/tariffs", createTariffRoutes({
    authMiddleware: middleware.auth,
    tariffController: controllers.tariffs
  }));
  routes.use("/watch-sessions", createWatchSessionRoutes({
    authMiddleware: middleware.auth,
    watchSessionController: controllers.watchSessions
  }));

  return routes;
}
