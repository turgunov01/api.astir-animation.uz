import { createChildRepository } from "./childRepository.js";
import { createContentCategoryRepository } from "./contentCategoryRepository.js";
import { createContentLikeRepository } from "./contentLikeRepository.js";
import { createContentMovieRepository } from "./contentMovieRepository.js";
import { createContentMovieTagRepository } from "./contentMovieTagRepository.js";
import { createContentTagRepository } from "./contentTagRepository.js";
import { createDeviceRepository } from "./deviceRepository.js";
import { createPairingSessionRepository } from "./pairingSessionRepository.js";
import { createParentRepository } from "./parentRepository.js";
import { createPostgresContentMovieTagRepository } from "./postgresContentMovieTagRepository.js";
import { createPostgresContentTagRepository } from "./postgresContentTagRepository.js";
import { createOtpCodeRepository } from "./otpCodeRepository.js";
import { createSubscriptionRepository } from "./subscriptionRepository.js";
import { createTariffRepository } from "./tariffRepository.js";
import { createWatchLimitRepository } from "./watchLimitRepository.js";
import { createWatchSessionRepository } from "./watchSessionRepository.js";

export function createRepositories(store, { contentDb = null } = {}) {
  const contentTags = contentDb
    ? createPostgresContentTagRepository(contentDb)
    : createContentTagRepository(store);
  const contentMovieTags = contentDb
    ? createPostgresContentMovieTagRepository(contentDb)
    : createContentMovieTagRepository(store);

  return {
    children: createChildRepository(store),
    contentCategories: createContentCategoryRepository(store),
    contentLikes: createContentLikeRepository(store),
    contentMovieTags,
    contentMovies: createContentMovieRepository(store),
    contentTags,
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
