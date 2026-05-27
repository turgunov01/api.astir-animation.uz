import { Router } from "express";
import { authRoutes } from "./authRoutes.js";
import { childrenRoutes } from "./childrenRoutes.js";
import { contentRoutes } from "./contentRoutes.js";
import { deviceRoutes } from "./deviceRoutes.js";
import { pairingRoutes } from "./pairingRoutes.js";
import { watchSessionRoutes } from "./watchSessionRoutes.js";

export const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/children", childrenRoutes);
routes.use("/pairing", pairingRoutes);
routes.use("/device", deviceRoutes);
routes.use("/content", contentRoutes);
routes.use("/watch-sessions", watchSessionRoutes);
