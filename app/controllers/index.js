import { createBillingController } from "./billingController.js";
import { createAuthController } from "./authController.js";
import { createChildrenController } from "./childrenController.js";
import { createContentController } from "./contentController.js";
import { createDeviceController } from "./deviceController.js";
import { createPairingController } from "./pairingController.js";
import { createTariffController } from "./tariffController.js";
import { createWatchSessionController } from "./watchSessionController.js";

export function createControllers(services) {
  return {
    auth: createAuthController({ authService: services.auth }),
    billing: createBillingController({ subscriptionService: services.subscriptions }),
    children: createChildrenController({ childService: services.children }),
    content: createContentController({ contentService: services.content }),
    device: createDeviceController({ watchService: services.watch }),
    pairing: createPairingController({ pairingService: services.pairing }),
    tariffs: createTariffController({ tariffService: services.tariffs }),
    watchSessions: createWatchSessionController({ watchService: services.watch })
  };
}
