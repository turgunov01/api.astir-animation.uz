import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createTariffRoutes({ authMiddleware, tariffController }) {
  const router = Router();

  router.get("/", asyncHandler(tariffController.list));
  router.post("/create", authMiddleware.requireParent, asyncHandler(tariffController.create));
  router.get("/current", authMiddleware.requireActor, asyncHandler(tariffController.current));
  router.patch("/current", authMiddleware.requireParent, asyncHandler(tariffController.updateCurrent));
  router.get("/:tariff_id", asyncHandler(tariffController.get));
  router.patch("/:tariff_id", authMiddleware.requireParent, asyncHandler(tariffController.update));
  router.delete("/:tariff_id", authMiddleware.requireParent, asyncHandler(tariffController.delete));

  return router;
}
