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
          is_premium: optionalBoolean(body, "is_premium", false),
          tag_ids: optionalStringArray(body, "tag_ids", []),
          tags: optionalStringArray(body, "tags", []),
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
          series: optionalStringArray(body, "series", []),
          tag_ids: optionalStringArray(body, "tag_ids", []),
          tags: optionalStringArray(body, "tags", []),
          is_premium: optionalBoolean(body, "is_premium", false),
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
      const result = await contentService.getMovie(request.actor, request.params.movie_id);

      response.json({
        data: result.movie,
        ...result
      });
    },

    async getMovieSeries(request, response) {
      response.json(await contentService.getMovieSeries(request.actor, request.params.movie_id));
    },

    async getTag(request, response) {
      response.json({
        tag: await contentService.getTag(request.params.tag_id)
      });
    },

    async list(request, response) {
      response.json({ content: await contentService.listContent() });
    },

    async listCategories(request, response) {
      response.json(await contentService.listCategories());
    },

    async listMovies(request, response) {
      response.json(await contentService.listMovies(request.actor));
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
    }
  };
}
