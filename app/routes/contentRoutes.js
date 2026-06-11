import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createContentRoutes({ authMiddleware, contentController, uploadMiddleware }) {
  const router = Router();
  const movieUpload = uploadMiddleware.fields([
    { name: "video", maxCount: 1 },
    { name: "poster", maxCount: 1 }
  ]);
  const posterUpload = uploadMiddleware.fields([
    { name: "poster", maxCount: 1 },
    { name: "file", maxCount: 1 }
  ]);
  const iconUpload = uploadMiddleware.single("icon");

  router.get("/", authMiddleware.requireActor, asyncHandler(contentController.list));
  router.get("/movies", authMiddleware.requireActor, asyncHandler(contentController.listMovies));
  router.get("/movies/popular", authMiddleware.requireActor, asyncHandler(contentController.listPopularMovies));
  router.get("/movies/:movie_id", authMiddleware.requireActor, asyncHandler(contentController.getMovie));
  router.get("/movies/:movie_id/offline", authMiddleware.requireActor, asyncHandler(contentController.getMovieOffline));
  router.get("/movies/:movie_id/series", authMiddleware.requireActor, asyncHandler(contentController.getMovieSeries));
  router.post(
    "/movies/create",
    authMiddleware.requireParent,
    movieUpload,
    asyncHandler(contentController.createMovie)
  );
  router.patch(
    "/movies/:movie_id",
    authMiddleware.requireParent,
    posterUpload,
    asyncHandler(contentController.updateMovie)
  );
  router.post(
    "/movies/:movie_id/poster",
    authMiddleware.requireParent,
    posterUpload,
    asyncHandler(contentController.updateMoviePoster)
  );
  router.put(
    "/movies/:movie_id/tags",
    authMiddleware.requireParent,
    asyncHandler(contentController.replaceMovieTags)
  );
  router.post(
    "/movies/:movie_id/series",
    authMiddleware.requireParent,
    movieUpload,
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
    iconUpload,
    asyncHandler(contentController.createCategory)
  );
  router.patch(
    "/categories/:category_id",
    authMiddleware.requireParent,
    iconUpload,
    asyncHandler(contentController.updateCategory)
  );
  router.delete(
    "/categories/:category_id",
    authMiddleware.requireParent,
    asyncHandler(contentController.deleteCategory)
  );
  router.get("/tags", authMiddleware.requireActor, asyncHandler(contentController.listTags));
  router.get("/tags/:tag_id", authMiddleware.requireActor, asyncHandler(contentController.getTag));
  router.post(
    "/tags/create",
    authMiddleware.requireParent,
    asyncHandler(contentController.createTag)
  );
  router.patch(
    "/tags/:tag_id",
    authMiddleware.requireParent,
    asyncHandler(contentController.updateTag)
  );
  router.delete(
    "/tags/:tag_id",
    authMiddleware.requireParent,
    asyncHandler(contentController.deleteTag)
  );
  router.get("/likes", authMiddleware.requireActor, asyncHandler(contentController.listLikes));
  router.get("/:content_id/blacklist", authMiddleware.requireActor, asyncHandler(contentController.checkBlacklist));
  router.post("/:content_id/blacklist", authMiddleware.requireActor, asyncHandler(contentController.blacklistContent));
  router.delete("/:content_id/blacklist", authMiddleware.requireActor, asyncHandler(contentController.unblacklistContent));
  router.get("/:content_id/like", authMiddleware.requireActor, asyncHandler(contentController.checkLike));
  router.post("/:content_id/like", authMiddleware.requireActor, asyncHandler(contentController.likeContent));
  router.delete("/:content_id/like", authMiddleware.requireActor, asyncHandler(contentController.unlikeContent));

  // New version of the movie creation endpoint that accepts JSON body instead of multipart form data

  

  return router;
}
