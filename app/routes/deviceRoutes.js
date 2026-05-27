import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";
import { requireDevice } from "../middleware/auth.js";
import { getDeviceConfig } from "../services/watchService.js";

export const deviceRoutes = Router();

deviceRoutes.get(
  "/config",
  requireDevice,
  asyncHandler((request, response) => {
    response.json(getDeviceConfig(request.device));
  })
);
