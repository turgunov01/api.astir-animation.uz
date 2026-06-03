import { createChildRepository } from "./childRepository.js";
import { createContentCategoryRepository } from "./contentCategoryRepository.js";
import { createContentMovieRepository } from "./contentMovieRepository.js";
import { createContentTagRepository } from "./contentTagRepository.js";
import { createDeviceRepository } from "./deviceRepository.js";
import { createPairingSessionRepository } from "./pairingSessionRepository.js";
import { createParentRepository } from "./parentRepository.js";
import { createOtpCodeRepository } from "./otpCodeRepository.js";
import { createSubscriptionRepository } from "./subscriptionRepository.js";
import { createTariffRepository } from "./tariffRepository.js";
import { createWatchLimitRepository } from "./watchLimitRepository.js";
import { createWatchSessionRepository } from "./watchSessionRepository.js";

export function createRepositories(store) {
  return {
    children: createChildRepository(store),
    contentCategories: createContentCategoryRepository(store),
    contentMovies: createContentMovieRepository(store),
    contentTags: createContentTagRepository(store),
    devices: createDeviceRepository(store),
    otpCodes: createOtpCodeRepository(store),
    pairingSessions: createPairingSessionRepository(store),
    parents: createParentRepository(store),
    subscriptions: createSubscriptionRepository(store),
    tariffs: createTariffRepository(store),
    watchLimits: createWatchLimitRepository(store),
    watchSessions: createWatchSessionRepository(store)
  };
}
