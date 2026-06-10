import fs from "node:fs";
import { badRequest } from "../lib/errors.js";
import {
  optionalBoolean,
  optionalLocalizedText,
  optionalString,
  optionalStringArray,
  requiredString,
  requiredLocalizedText
} from "../lib/validation.js";

function parseJsonField(value, field) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw badRequest(`${field} must be valid JSON`, "VALIDATION_ERROR");
  }
}

function payload(request) {
  const body = { ...request.body };

  if (body.metadata) {
    const metadata = parseJsonField(body.metadata, "metadata");
    delete body.metadata;
    Object.assign(body, metadata);
  }

  for (const field of ["title", "description", "series", "tag_ids", "tags"]) {
    if (body[field] !== undefined) {
      body[field] = parseJsonField(body[field], field);
    }
  }

  return body;
}

function cleanupUploadedFile(file) {
  if (file?.path) {
    fs.rmSync(file.path, { force: true });
  }
}

function uploadedFiles(request) {
  const files = [];

  if (request.file) {
    files.push(request.file);
  }

  for (const value of Object.values(request.files || {})) {
    if (Array.isArray(value)) {
      files.push(...value);
    }
  }

  return files;
}

function uploadedFile(request, field) {
  if (request.file?.fieldname === field) {
    return request.file;
  }

  const files = request.files?.[field];

  return Array.isArray(files) ? files[0] || null : null;
}

function uploadedPosterFile(request) {
  return uploadedFile(request, "poster") || uploadedFile(request, "file");
}

function logMovieUpload(request, event, details = {}) {
  console.info(JSON.stringify({
    event: `movie_upload.${event}`,
    requestId: request.id,
    ...details
  }));
}

function contentIdParam(request) {
  return request.params.content_id || request.params.movie_id;
}

function blacklistChildIdParam(request) {
  const childId = firstQueryValue(
    request.body?.childId
    || request.body?.child_id
    || request.query.childId
    || request.query.child_id
  );

  if (!childId) {
    throw badRequest("childId is required", "VALIDATION_ERROR");
  }

  return childId;
}

function optionalChildIdParam(request) {
  return firstQueryValue(
    request.body?.childId
    || request.body?.child_id
    || request.query.childId
    || request.query.child_id
  );
}

async function withUploadCleanup(request, work) {
  try {
    return await work();
  } catch (error) {
    for (const file of uploadedFiles(request)) {
      cleanupUploadedFile(file);
    }

    throw error;
  }
}

function optionalPresentString(body, field) {
  const value = optionalString(body, field);

  if (value === null) {
    throw badRequest(`${field} must be a non-empty string`, "VALIDATION_ERROR");
  }

  return value;
}

function optionalPresentBoolean(body, field) {
  const value = optionalBoolean(body, field);

  if (value === null) {
    throw badRequest(`${field} must be true or false`, "VALIDATION_ERROR");
  }

  return value;
}

function firstQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return value || "";
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

function deviceParentId(device) {
  return firstValue(device?.parentId, device?.parent_id, device?.parent?.id);
}

function deviceChildId(device) {
  return firstValue(device?.childId, device?.child_id, device?.currentChildId, device?.current_child_id);
}

function blacklistTarget(request) {
  if (request.actor?.type === "device") {
    const device = request.device || request.actor.device;
    const parentId = deviceParentId(device);
    const childId = deviceChildId(device);

    if (!parentId || !childId) {
      throw badRequest("Device must be paired to a child", "VALIDATION_ERROR");
    }

    return { parentId, childId };
  }

  return {
    parentId: request.parent?.id || request.actor?.parent?.id,
    childId: blacklistChildIdParam(request)
  };
}

function queryList(value) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((entry) => String(entry || "").split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function optionalIntegerValue(body, field, fallback = null, options = {}) {
  const value = body?.[field];

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numeric)) {
    throw badRequest(`${field} must be an integer`, "VALIDATION_ERROR");
  }

  if (options.min !== undefined && numeric < options.min) {
    throw badRequest(`${field} must be at least ${options.min}`, "VALIDATION_ERROR");
  }

  if (options.max !== undefined && numeric > options.max) {
    throw badRequest(`${field} must be at most ${options.max}`, "VALIDATION_ERROR");
  }

  return numeric;
}

function optionalPresentInteger(body, field, options = {}) {
  const value = optionalIntegerValue(body, field, null, options);

  if (value === null) {
    throw badRequest(`${field} must be an integer`, "VALIDATION_ERROR");
  }

  return value;
}

const durationFields = ["duration_sec", "duration_seconds", "durationSec", "duration"];

function firstPresentField(body, fields) {
  return fields.find((field) => Object.hasOwn(body, field));
}

function optionalDurationSeconds(body, fallback = 0) {
  const field = firstPresentField(body, durationFields);

  return field
    ? optionalIntegerValue(body, field, fallback, { min: 0 })
    : fallback;
}

function optionalPresentDurationSeconds(body) {
  const field = firstPresentField(body, durationFields);

  return optionalPresentInteger(body, field, { min: 0 });
}

function movieMetadataAttributes(body, { includeDefaults = false } = {}) {
  const attributes = {};

  if (includeDefaults || Object.hasOwn(body, "series")) {
    attributes.series = optionalStringArray(body, "series", []);
  }

  if (includeDefaults || Object.hasOwn(body, "tag_ids")) {
    attributes.tag_ids = optionalStringArray(body, "tag_ids", []);
  }

  if (includeDefaults || Object.hasOwn(body, "tags")) {
    attributes.tags = optionalStringArray(body, "tags", []);
  }

  if (includeDefaults || Object.hasOwn(body, "is_premium")) {
    attributes.is_premium = optionalBoolean(body, "is_premium", false);
  }

  if (Object.hasOwn(body, "category_id")) {
    attributes.category_id = optionalString(body, "category_id");
  }

  if (Object.hasOwn(body, "series_id")) {
    attributes.series_id = optionalString(body, "series_id");
  }

  if (Object.hasOwn(body, "content_type")) {
    attributes.content_type = optionalString(body, "content_type");
  }

  if (Object.hasOwn(body, "year")) {
    attributes.year = optionalIntegerValue(body, "year", null, { min: 0 });
  }

  if (includeDefaults || Object.hasOwn(body, "age_rating")) {
    attributes.age_rating = optionalIntegerValue(body, "age_rating", 0, { min: 0 });
  }

  if (includeDefaults || firstPresentField(body, durationFields)) {
    attributes.duration_sec = optionalDurationSeconds(body, 0);
  }

  if (includeDefaults || Object.hasOwn(body, "published")) {
    attributes.published = optionalBoolean(body, "published", false);
  }

  return attributes;
}

export function createContentController({ contentService }) {
  return {
    async createCategory(request, response) {
      const category = await withUploadCleanup(request, async () => {
        const body = payload(request);

        return await contentService.createCategory({
          title: requiredLocalizedText(body, "title"),
          description: requiredLocalizedText(body, "description"),
          type: optionalString(body, "type") || "other",
          slug: optionalString(body, "slug"),
          active: optionalBoolean(body, "active", true),
          file: request.file || null
        });
      });

      response.status(201).json({ category });
    },

    async addSeriesMovie(request, response) {
      const result = await withUploadCleanup(request, async () => {
        const body = payload(request);

        return await contentService.addSeriesMovie(request.params.movie_id, {
          title: requiredLocalizedText(body, "title"),
          description: requiredLocalizedText(body, "description"),
          ...movieMetadataAttributes(body, { includeDefaults: true }),
          file: uploadedFile(request, "video"),
          posterFile: uploadedFile(request, "poster")
        });
      });

      response.status(201).json(result);
    },

    async createMovie(request, response) {
      const movie = await withUploadCleanup(request, async () => {
        logMovieUpload(request, "started", {
          contentType: request.get("content-type") || null,
          hasVideo: Boolean(uploadedFile(request, "video")),
          hasPoster: Boolean(uploadedFile(request, "poster"))
        });

        const body = payload(request);

        logMovieUpload(request, "metadata_parsed", {
          hasTitle: Boolean(body.title),
          hasDescription: Boolean(body.description),
          seriesCount: Array.isArray(body.series) ? body.series.length : 0
        });

        const videoFile = uploadedFile(request, "video");
        const posterFile = uploadedFile(request, "poster");

        if (videoFile) {
          logMovieUpload(request, "file_stored", {
            path: videoFile.path,
            fileName: videoFile.filename,
            originalName: videoFile.originalname,
            mimeType: videoFile.mimetype,
            size: videoFile.size
          });
        }

        const createdMovie = await contentService.createMovie({
          title: requiredLocalizedText(body, "title"),
          description: requiredLocalizedText(body, "description"),
          ...movieMetadataAttributes(body, { includeDefaults: true }),
          file: videoFile,
          posterFile
        });

        if (!createdMovie?.id) {
          throw new Error("Movie record was not created");
        }

        logMovieUpload(request, "record_created", {
          movieId: createdMovie.id
        });

        if (createdMovie.transcode_job_id) {
          logMovieUpload(request, "transcode_queued", {
            movieId: createdMovie.id,
            jobId: createdMovie.transcode_job_id
          });
        }

        return createdMovie;
      });

      response.status(201).json({
        data: movie,
        movie
      });
    },

    async checkLike(request, response) {
      response.json(contentService.getLikeStatus(request.actor, contentIdParam(request)));
    },

    async checkBlacklist(request, response) {
      const target = blacklistTarget(request);
      const result = await contentService.getBlacklistStatusAsync(
        target.parentId,
        target.childId,
        contentIdParam(request)
      );
      response.json(result);
    },

    async createTag(request, response) {
      const tag = await contentService.createTag({
        name: requiredString(request.body, "name"),
        slug: optionalString(request.body, "slug"),
        active: optionalBoolean(request.body, "active", true)
      });

      response.status(201).json({ tag });
    },

    async deleteCategory(request, response) {
      response.json(await contentService.deleteCategory(request.params.category_id));
    },

    async deleteMovie(request, response) {
      response.json(await contentService.deleteMovie(request.params.movie_id));
    },

    async deleteTag(request, response) {
      response.json(await contentService.deleteTag(request.params.tag_id));
    },

    async getCategory(request, response) {
      response.json({
        category: await contentService.getCategory(request.params.category_id)
      });
    },

    async getMovie(request, response) {
      const result = await contentService.getMovie(request.actor, request.params.movie_id, {
        childId: optionalChildIdParam(request)
      });

      response.json({
        data: result.movie,
        ...result
      });
    },

    async getMovieSeries(request, response) {
      response.json(await contentService.getMovieSeries(request.actor, request.params.movie_id, {
        childId: optionalChildIdParam(request)
      }));
    },

    async getTag(request, response) {
      response.json({
        tag: await contentService.getTag(request.params.tag_id)
      });
    },

    async list(request, response) {
      response.json({
        content: await contentService.listContent(request.actor, {
          liked: request.query.liked === "true",
          q: firstQueryValue(request.query.q || request.query.search)
        })
      });
    },

    async listCategories(request, response) {
      response.json(await contentService.listCategories());
    },

    async listLikes(request, response) {
      response.json(await contentService.listLikedContent(request.actor));
    },

    async listMovies(request, response) {
      response.json(await contentService.listMovies(request.actor, {
        category: firstQueryValue(request.query.category || request.query.category_id),
        childId: optionalChildIdParam(request),
        liked: request.query.liked === "true",
        q: firstQueryValue(request.query.q || request.query.search),
        tags: queryList(request.query.tags || request.query.tag_ids),
        page: firstQueryValue(request.query.page),
        limit: firstQueryValue(request.query.limit)
      }));
    },

    async likeContent(request, response) {
      response.status(201).json(contentService.likeContent(request.actor, contentIdParam(request)));
    },

    async blacklistContent(request, response) {
      const target = blacklistTarget(request);
      const result = await contentService.blacklistContentAsync(
        target.parentId,
        target.childId,
        contentIdParam(request)
      );
      response.status(201).json(result);
    },

    async listTags(request, response) {
      response.json(await contentService.listTags());
    },

    async replaceMovieTags(request, response) {
      const body = payload(request);

      if (!Object.hasOwn(body, "tag_ids") && !Object.hasOwn(body, "tags")) {
        throw badRequest("tag_ids or tags is required", "VALIDATION_ERROR");
      }

      response.json(await contentService.replaceMovieTags(request.params.movie_id, {
        tag_ids: optionalStringArray(body, "tag_ids", []),
        tags: optionalStringArray(body, "tags", [])
      }));
    },

    async updateCategory(request, response) {
      const category = await withUploadCleanup(request, async () => {
        const body = payload(request);
        const attributes = {};

        if (Object.hasOwn(body, "title")) {
          attributes.title = requiredLocalizedText(body, "title");
        }

        if (Object.hasOwn(body, "description")) {
          attributes.description = optionalLocalizedText(body, "description");
        }

        if (Object.hasOwn(body, "type")) {
          attributes.type = optionalPresentString(body, "type");
        }

        if (Object.hasOwn(body, "slug")) {
          attributes.slug = optionalPresentString(body, "slug");
        }

        if (Object.hasOwn(body, "active")) {
          attributes.active = optionalPresentBoolean(body, "active");
        }

        if (request.file) {
          attributes.file = request.file;
        }

        if (Object.keys(attributes).length === 0) {
          throw badRequest("At least one field is required", "VALIDATION_ERROR");
        }

        return await contentService.updateCategory(request.params.category_id, attributes);
      });

      response.json({ category });
    },

    async updateMovie(request, response) {
      const result = await withUploadCleanup(request, async () => {
        const body = payload(request);
        const attributes = {};

        if (Object.hasOwn(body, "title")) {
          attributes.title = requiredLocalizedText(body, "title");
        }

        if (Object.hasOwn(body, "description")) {
          attributes.description = optionalLocalizedText(body, "description");
        }

        if (Object.hasOwn(body, "is_premium")) {
          attributes.is_premium = optionalPresentBoolean(body, "is_premium");
        }

        if (Object.hasOwn(body, "tag_ids")) {
          attributes.tag_ids = optionalStringArray(body, "tag_ids", []);
        }

        if (Object.hasOwn(body, "tags")) {
          attributes.tags = optionalStringArray(body, "tags", []);
        }

        if (Object.hasOwn(body, "category_id")) {
          attributes.category_id = optionalString(body, "category_id");
        }

        if (Object.hasOwn(body, "series_id")) {
          attributes.series_id = optionalString(body, "series_id");
        }

        if (Object.hasOwn(body, "content_type")) {
          attributes.content_type = optionalString(body, "content_type");
        }

        if (Object.hasOwn(body, "year")) {
          attributes.year = optionalIntegerValue(body, "year", null, { min: 0 });
        }

        if (Object.hasOwn(body, "age_rating")) {
          attributes.age_rating = optionalPresentInteger(body, "age_rating", { min: 0 });
        }

        if (firstPresentField(body, durationFields)) {
          attributes.duration_sec = optionalPresentDurationSeconds(body);
        }

        if (Object.hasOwn(body, "published")) {
          attributes.published = optionalPresentBoolean(body, "published");
        }

        const posterFile = uploadedPosterFile(request);

        if (posterFile) {
          attributes.posterFile = posterFile;
        }

        if (Object.keys(attributes).length === 0) {
          throw badRequest("At least one field is required", "VALIDATION_ERROR");
        }

        return await contentService.updateMovie(request.params.movie_id, attributes);
      });

      response.json({
        data: result.movie,
        ...result
      });
    },

    async updateMoviePoster(request, response) {
      const result = await withUploadCleanup(request, async () => {
        const posterFile = uploadedPosterFile(request);

        if (!posterFile) {
          throw badRequest("poster is required", "VALIDATION_ERROR");
        }

        return await contentService.updateMovie(request.params.movie_id, {
          posterFile
        });
      });

      response.json({
        data: result.movie,
        ...result
      });
    },

    async updateTag(request, response) {
      const attributes = {};

      if (Object.hasOwn(request.body, "name")) {
        attributes.name = optionalPresentString(request.body, "name");
      }

      if (Object.hasOwn(request.body, "slug")) {
        attributes.slug = optionalPresentString(request.body, "slug");
      }

      if (Object.hasOwn(request.body, "active")) {
        attributes.active = optionalPresentBoolean(request.body, "active");
      }

      if (Object.keys(attributes).length === 0) {
        throw badRequest("At least one field is required", "VALIDATION_ERROR");
      }

      response.json({
        tag: await contentService.updateTag(request.params.tag_id, attributes)
      });
    },

    async unlikeContent(request, response) {
      response.json(contentService.unlikeContent(request.actor, contentIdParam(request)));
    },

    async unblacklistContent(request, response) {
      const target = blacklistTarget(request);
      const result = await contentService.unblacklistContentAsync(
        target.parentId,
        target.childId,
        contentIdParam(request)
      );
      response.json(result);
    }
  };
}
