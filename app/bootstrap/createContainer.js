import { config } from "../config.js";
import { createControllers } from "../controllers/index.js";
import { createLegacyDb } from "../legacy/db.js";
import { createLegacyStreaming } from "../legacy/streaming.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { createUploadMiddleware } from "../middleware/upload.js";
import { createRepositories } from "../repositories/index.js";
import { createAuthService } from "../services/authService.js";
import { createChildService } from "../services/childService.js";
import { createContentPurge } from "../services/contentPurge.js";
import { createPaymentProviders } from "../services/paymentProviders.js";
import { createPresence } from "../services/presence.js";
import { createApiMonitor } from "../services/apiMonitor.js";
import { createRequestJournal } from "../services/requestJournal.js";
import { createApiRequestStore } from "../services/apiRequestStore.js";
import { createProjectSettings } from "../services/projectSettings.js";
import { createContentService } from "../services/contentService.js";
import { createFaqService } from "../services/faqService.js";
import { createLegacyStreamingState } from "../services/legacyStreamingState.js";
import { createNotificationService } from "../services/notificationService.js";
import { createPairingService } from "../services/pairingService.js";
import { createRecommendationService } from "../services/recommendationService.js";
import { createAppStoreClient, createGooglePlayClient } from "../services/storeVerifiers.js";
import { createAdminDeviceService } from "../services/adminDeviceService.js";
import { createSubscriptionService } from "../services/subscriptionService.js";
import { createTariffService } from "../services/tariffService.js";
import { createTariffStoreSync } from "../services/tariffStoreSync.js";
import { createTranscoderService } from "../services/transcoderService.js";
import { createWatchService } from "../services/watchService.js";
import { store as defaultStore } from "../store/jsonStore.js";

export function createContainer({ store = defaultStore } = {}) {
  const databaseDb = config.databaseUrl
    ? createLegacyDb({ databaseUrl: config.databaseUrl })
    : null;
  const billingDb = databaseDb;
  const contentDb = config.contentStorage === "postgres" ? databaseDb : null;
  const searchDb = databaseDb;
  const repositories = createRepositories(store, {
    billingDb,
    contentDb,
    identityDb: databaseDb,
    searchDb
  });
  const services = {};

  services.auth = createAuthService({
    config,
    otpCodes: repositories.otpCodes,
    parents: repositories.parents
  });
  services.children = createChildService({
    childContentBlacklist: repositories.childContentBlacklist,
    children: repositories.children,
    contentLikes: repositories.contentLikes,
    contentMovies: repositories.contentMovies,
    devices: repositories.devices,
    watchLimits: repositories.watchLimits
  });
  services.notifications = createNotificationService({
    config,
    notifications: repositories.notifications
  });
  services.subscriptions = createSubscriptionService({
    appStore: createAppStoreClient(config.appleIap),
    config,
    googlePlay: createGooglePlayClient(config.googlePlay),
    notificationService: services.notifications,
    parents: repositories.parents,
    subscriptions: repositories.subscriptions,
    tariffs: repositories.tariffs,
    transactions: repositories.transactions
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
  // Restart transcodes a previous server process didn't finish.
  setTimeout(() => {
    try {
      const cleaned = services.transcoder.cleanupOrphanOutputs();
      if (cleaned) console.log(JSON.stringify({ event: "transcode_orphans_removed", count: cleaned }));
      const resumed = services.transcoder.resumeInterrupted();
      if (resumed) console.log(JSON.stringify({ event: "transcode_resumed", count: resumed }));
      services.transcoder.backfillDurations()
        .then((filled) => filled && console.log(JSON.stringify({ event: "durations_backfilled", count: filled })))
        .catch((error) => console.error(JSON.stringify({ event: "duration_backfill_failed", message: error.message })));
    } catch (error) {
      console.error(JSON.stringify({ event: "transcode_resume_failed", message: error.message }));
    }
  }, 5000).unref();
  services.legacyStreaming = createLegacyStreaming({ config });
  services.paymentProviders = createPaymentProviders({ db: databaseDb, config });
  services.tariffStoreSync = createTariffStoreSync({
    config,
    tariffService: services.tariffs,
    paymentProviders: services.paymentProviders
  });
  services.presence = createPresence({ db: databaseDb });
  services.apiMonitor = createApiMonitor();
  // Kept in Postgres so the journal and monitoring survive restarts.
  services.requestJournal = databaseDb ? createApiRequestStore({ db: databaseDb }) : createRequestJournal();
  services.projectSettings = createProjectSettings({ db: databaseDb, config });
  // Admin-entered payment credentials override .env once loaded.
  services.paymentProviders.loadSettings().catch(() => {});
  services.contentPurge = createContentPurge({
    db: databaseDb,
    mediaRoot: config.mediaRoot,
    streaming: services.legacyStreaming,
    contentReactions: repositories.contentReactions,
    watchSessions: repositories.watchSessions
  });
  services.content = createContentService({
    contentPurge: services.contentPurge,
    contentCategories: repositories.contentCategories,
    contentLikes: repositories.contentLikes,
    contentMovieTags: repositories.contentMovieTags,
    contentMovies: repositories.contentMovies,
    contentSearch: repositories.contentSearch,
    contentStreaming: createLegacyStreamingState({ db: searchDb }),
    contentTags: repositories.contentTags,
    childService: services.children,
    tariffService: services.tariffs,
    transcoder: services.transcoder,
    usageDb: databaseDb
  });
  services.faqs = createFaqService({
    faqs: repositories.faqs
  });
  services.recommendations = createRecommendationService({
    contentService: services.content,
    recommendations: repositories.recommendations
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

  services.adminDevices = createAdminDeviceService({
    children: repositories.children,
    devices: repositories.devices,
    pairing: services.pairing,
    pairingSessions: repositories.pairingSessions,
    parents: repositories.parents,
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
    databaseDb,
    contentDb,
    searchDb
  };
}
