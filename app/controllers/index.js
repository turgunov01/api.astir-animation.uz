import { createBillingController } from "./billingController.js";
import { createAuthController } from "./authController.js";
import { createChildrenController } from "./childrenController.js";
import { createContentController } from "./contentController.js";
import { createDeviceController } from "./deviceController.js";
import { createFaqController } from "./faqController.js";
import { createNotificationController } from "./notificationController.js";
import { createPairingController } from "./pairingController.js";
import { createRecommendationController } from "./recommendationController.js";
import { createTariffController } from "./tariffController.js";
import { createWatchSessionController } from "./watchSessionController.js";

export function createControllers(services) {
  return {
    auth: createAuthController({ authService: services.auth }),
    billing: createBillingController({ subscriptionService: services.subscriptions }),
    children: createChildrenController({ childService: services.children }),
    content: createContentController({ contentService: services.content }),
    device: createDeviceController({ watchService: services.watch }),
    faqs: createFaqController({ faqService: services.faqs }),
    notifications: createNotificationController({ notificationService: services.notifications }),
    pairing: createPairingController({ pairingService: services.pairing }),
    recommendations: createRecommendationController({ recommendationService: services.recommendations }),
    tariffs: createTariffController({ tariffService: services.tariffs }),
    watchSessions: createWatchSessionController({ watchService: services.watch })
  };
}
