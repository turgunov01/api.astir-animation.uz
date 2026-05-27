import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";
import { requireActor } from "../middleware/auth.js";
import { listContent } from "../services/contentService.js";

export const contentRoutes = Router();

contentRoutes.get(
  "/",
  requireActor,
  asyncHandler((request, response) => {
    response.json({ content: listContent() });
  })
);
