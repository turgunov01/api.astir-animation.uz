import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createContentRoutes({ authMiddleware, contentController, uploadMiddleware }) {
  const router = Router();
  const videoUpload = uploadMiddleware.single("video");

  router.get("/", authMiddleware.requireActor, asyncHandler(contentController.list));
  router.get("/movies", authMiddleware.requireActor, asyncHandler(contentController.listMovies));
  router.get("/movies/:movie_id", authMiddleware.requireActor, asyncHandler(contentController.getMovie));
  router.get("/movies/:movie_id/series", authMiddleware.requireActor, asyncHandler(contentController.getMovieSeries));
  router.post(
    "/movies/create",
    authMiddleware.requireParent,
    videoUpload,
    asyncHandler(contentController.createMovie)
  );
  router.patch(
    "/movies/:movie_id",
    authMiddleware.requireParent,
    asyncHandler(contentController.updateMovie)
  );
  router.post(
    "/movies/:movie_id/series",
    authMiddleware.requireParent,
    videoUpload,
    asyncHandler(contentController.addSeriesMovie)
  );
  router.delete(
    "/movies/:movie_id",
    authMiddleware.requireParent,
    asyncHandler(contentController.deleteMovie)
  );
  router.get("/categories", authMiddleware.requireActor, asyncHandler(contentController.listCategories));
  router.get("/categories/:category_id", authMiddleware.requireActor, asyncHandler(contentController.getCategory));
  router.post(
    "/categories/create",
    authMiddleware.requireParent,
    asyncHandler(contentController.createCategory)
  );
  router.patch(
    "/categories/:category_id",
    authMiddleware.requireParent,
    asyncHandler(contentController.updateCategory)
  );
  router.delete(
    "/categories/:category_id",
    authMiddleware.requireParent,
    asyncHandler(contentController.deleteCategory)
  );

  return router;
}
