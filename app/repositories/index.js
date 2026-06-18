import { createChildRepository } from "./childRepository.js";
import { createChildContentBlacklistRepository } from "./childContentBlacklistRepository.js";
import { createContentCategoryRepository } from "./contentCategoryRepository.js";
import { createContentLikeRepository } from "./contentLikeRepository.js";
import { createContentMovieRepository } from "./contentMovieRepository.js";
import { createContentMovieTagRepository } from "./contentMovieTagRepository.js";
import { createContentTagRepository } from "./contentTagRepository.js";
import { createDeviceRepository } from "./deviceRepository.js";
import { createFaqRepository } from "./faqRepository.js";
import { createNotificationRepository } from "./notificationRepository.js";
import { createPairingSessionRepository } from "./pairingSessionRepository.js";
import { createParentRepository } from "./parentRepository.js";
import { createPostgresChildRepository } from "./postgresChildRepository.js";
import { createPostgresContentMovieTagRepository } from "./postgresContentMovieTagRepository.js";
import { createPostgresContentSearchRepository } from "./postgresContentSearchRepository.js";
import { createPostgresContentTagRepository } from "./postgresContentTagRepository.js";
import { createPostgresParentRepository } from "./postgresParentRepository.js";
import { createOtpCodeRepository } from "./otpCodeRepository.js";
import { createRecommendationRepository } from "./recommendationRepository.js";
import { createSubscriptionRepository } from "./subscriptionRepository.js";
import { createTariffRepository } from "./tariffRepository.js";
import { createTransactionRepository } from "./transactionRepository.js";
import { createWatchLimitRepository } from "./watchLimitRepository.js";
import { createWatchSessionRepository } from "./watchSessionRepository.js";

export function createRepositories(store, { contentDb = null, searchDb = contentDb } = {}) {
  const contentTags = contentDb
    ? createPostgresContentTagRepository(contentDb)
    : createContentTagRepository(store);
  const contentMovieTags = contentDb
    ? createPostgresContentMovieTagRepository(contentDb)
    : createContentMovieTagRepository(store);
  const children = contentDb
    ? createPostgresChildRepository(contentDb)
    : createChildRepository(store);
  const parents = contentDb
    ? createPostgresParentRepository(contentDb)
    : createParentRepository(store);

  return {
    childContentBlacklist: createChildContentBlacklistRepository(store),
    children,
    contentCategories: createContentCategoryRepository(store),
    contentLikes: createContentLikeRepository(store),
    contentMovieTags,
    contentMovies: createContentMovieRepository(store),
    contentSearch: searchDb ? createPostgresContentSearchRepository(searchDb) : null,
    contentTags,
    devices: createDeviceRepository(store),
    faqs: createFaqRepository(store),
    notifications: createNotificationRepository(store),
    otpCodes: createOtpCodeRepository(store),
    pairingSessions: createPairingSessionRepository(store),
    parents,
    recommendations: createRecommendationRepository(store),
    subscriptions: createSubscriptionRepository(store),
    tariffs: createTariffRepository(store),
    transactions: createTransactionRepository(store),
    watchLimits: createWatchLimitRepository(store),
    watchSessions: createWatchSessionRepository(store)
  };
}
