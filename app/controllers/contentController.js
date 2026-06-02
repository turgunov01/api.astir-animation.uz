import fs from "node:fs";
import { badRequest } from "../lib/errors.js";
import {
  optionalBoolean,
  optionalLocalizedText,
  optionalStringArray,
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

  for (const field of ["title", "description", "series"]) {
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

function logMovieUpload(request, event, details = {}) {
  console.info(JSON.stringify({
    event: `movie_upload.${event}`,
    requestId: request.id,
    ...details
  }));
}

function withUploadCleanup(request, work) {
  try {
    return work();
  } catch (error) {
    cleanupUploadedFile(request.file);
    throw error;
  }
}

export function createContentController({ contentService }) {
  return {
    createCategory(request, response) {
      const category = withUploadCleanup(request, () => {
        const body = payload(request);

        return contentService.createCategory({
          title: requiredLocalizedText(body, "title"),
          description: requiredLocalizedText(body, "description"),
          file: request.file || null
        });
      });

      response.status(201).json({ category });
    },

    addSeriesMovie(request, response) {
      const result = withUploadCleanup(request, () => {
        const body = payload(request);

        return contentService.addSeriesMovie(request.params.movie_id, {
          title: requiredLocalizedText(body, "title"),
          description: requiredLocalizedText(body, "description"),
          is_premium: optionalBoolean(body, "is_premium", false),
          file: request.file || null
        });
      });

      response.status(201).json(result);
    },

    createMovie(request, response) {
      const movie = withUploadCleanup(request, () => {
        logMovieUpload(request, "started", {
          contentType: request.get("content-type") || null,
          hasVideo: Boolean(request.file)
        });

        const body = payload(request);

        logMovieUpload(request, "metadata_parsed", {
          hasTitle: Boolean(body.title),
          hasDescription: Boolean(body.description),
          seriesCount: Array.isArray(body.series) ? body.series.length : 0
        });

        if (request.file) {
          logMovieUpload(request, "file_stored", {
            path: request.file.path,
            fileName: request.file.filename,
            originalName: request.file.originalname,
            mimeType: request.file.mimetype,
            size: request.file.size
          });
        }

        const createdMovie = contentService.createMovie({
          title: requiredLocalizedText(body, "title"),
          description: requiredLocalizedText(body, "description"),
          series: optionalStringArray(body, "series", []),
          is_premium: optionalBoolean(body, "is_premium", false),
          file: request.file || null
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

    deleteCategory(request, response) {
      response.json(contentService.deleteCategory(request.params.category_id));
    },

    deleteMovie(request, response) {
      response.json(contentService.deleteMovie(request.params.movie_id));
    },

    getCategory(request, response) {
      response.json({
        category: contentService.getCategory(request.params.category_id)
      });
    },

    getMovie(request, response) {
      const result = contentService.getMovie(request.actor, request.params.movie_id);

      response.json({
        data: result.movie,
        ...result
      });
    },

    getMovieSeries(request, response) {
      response.json(contentService.getMovieSeries(request.actor, request.params.movie_id));
    },

    list(request, response) {
      response.json({ content: contentService.listContent() });
    },

    listCategories(request, response) {
      response.json(contentService.listCategories());
    },

    listMovies(request, response) {
      response.json(contentService.listMovies(request.actor));
    },

    updateCategory(request, response) {
      const category = withUploadCleanup(request, () => {
        const body = payload(request);
        const attributes = {};

        if (Object.hasOwn(body, "title")) {
          attributes.title = requiredLocalizedText(body, "title");
        }

        if (Object.hasOwn(body, "description")) {
          attributes.description = optionalLocalizedText(body, "description");
        }

        if (request.file) {
          attributes.file = request.file;
        }

        if (Object.keys(attributes).length === 0) {
          throw badRequest("At least one field is required", "VALIDATION_ERROR");
        }

        return contentService.updateCategory(request.params.category_id, attributes);
      });

      response.json({ category });
    },

    updateMovie(request, response) {
      const body = payload(request);
      const attributes = {};

      if (Object.hasOwn(body, "title")) {
        attributes.title = requiredLocalizedText(body, "title");
      }

      if (Object.hasOwn(body, "description")) {
        attributes.description = optionalLocalizedText(body, "description");
      }

      if (Object.keys(attributes).length === 0) {
        throw badRequest("At least one field is required", "VALIDATION_ERROR");
      }

      const result = contentService.updateMovie(request.params.movie_id, attributes);

      response.json({
        data: result.movie,
        ...result
      });
    }
  };
}
