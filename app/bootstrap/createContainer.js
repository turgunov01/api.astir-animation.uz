import { config } from "../config.js";
import { createControllers } from "../controllers/index.js";
import { createLegacyDb } from "../legacy/db.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { createUploadMiddleware } from "../middleware/upload.js";
import { createRepositories } from "../repositories/index.js";
import { createAuthService } from "../services/authService.js";
import { createChildService } from "../services/childService.js";
import { createContentService } from "../services/contentService.js";
import { createPairingService } from "../services/pairingService.js";
import { createSubscriptionService } from "../services/subscriptionService.js";
import { createTariffService } from "../services/tariffService.js";
import { createTranscoderService } from "../services/transcoderService.js";
import { createWatchService } from "../services/watchService.js";
import { store as defaultStore } from "../store/jsonStore.js";

export function createContainer({ store = defaultStore } = {}) {
  const contentDb = config.contentStorage === "postgres" && config.databaseUrl
    ? createLegacyDb({ databaseUrl: config.databaseUrl })
    : null;
  const repositories = createRepositories(store, { contentDb });
  const services = {};

  services.auth = createAuthService({
    config,
    otpCodes: repositories.otpCodes,
    parents: repositories.parents
  });
  services.children = createChildService({
    children: repositories.children,
    watchLimits: repositories.watchLimits
  });
  services.subscriptions = createSubscriptionService({
    parents: repositories.parents,
    subscriptions: repositories.subscriptions,
    tariffs: repositories.tariffs
  });
  services.tariffs = createTariffService({
    parents: repositories.parents,
    subscriptions: services.subscriptions,
    tariffs: repositories.tariffs
  });
  services.transcoder = createTranscoderService({
    config,
    contentMovies: repositories.contentMovies
  });
  services.content = createContentService({
    contentCategories: repositories.contentCategories,
    contentMovieTags: repositories.contentMovieTags,
    contentMovies: repositories.contentMovies,
    contentTags: repositories.contentTags,
    tariffService: services.tariffs,
    transcoder: services.transcoder
  });
  services.pairing = createPairingService({
    childService: services.children,
    config,
    devices: repositories.devices,
    pairingSessions: repositories.pairingSessions
  });
  services.watch = createWatchService({
    childService: services.children,
    children: repositories.children,
    contentService: services.content,
    watchSessions: repositories.watchSessions
  });

  const middleware = {
    auth: createAuthMiddleware({
      children: repositories.children,
      config,
      devices: repositories.devices,
      parents: repositories.parents,
      watchLimits: repositories.watchLimits
    }),
    upload: createUploadMiddleware(config)
  };
  const controllers = createControllers(services);

  return {
    config,
    controllers,
    middleware,
    repositories,
    services,
    store,
    contentDb
  };
}
