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
      const category = contentService.createCategory({
        title: requiredLocalizedText(request.body, "title"),
        description: requiredLocalizedText(request.body, "description")
      });

      response.status(201).json({ category });
    },

    addSeriesMovie(request, response) {
      const body = payload(request);

      const result = withUploadCleanup(request, () => contentService.addSeriesMovie(request.params.movie_id, {
        title: requiredLocalizedText(body, "title"),
        description: requiredLocalizedText(body, "description"),
        is_premium: optionalBoolean(body, "is_premium", false),
        file: request.file || null
      }));

      response.status(201).json(result);
    },

    createMovie(request, response) {
      const body = payload(request);

      const movie = withUploadCleanup(request, () => contentService.createMovie({
        title: requiredLocalizedText(body, "title"),
        description: requiredLocalizedText(body, "description"),
        series: optionalStringArray(body, "series", []),
        is_premium: optionalBoolean(body, "is_premium", false),
        file: request.file || null
      }));

      response.status(201).json({ movie });
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
      response.json(contentService.getMovie(request.actor, request.params.movie_id));
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
      const attributes = {};

      if (Object.hasOwn(request.body, "title")) {
        attributes.title = requiredLocalizedText(request.body, "title");
      }

      if (Object.hasOwn(request.body, "description")) {
        attributes.description = optionalLocalizedText(request.body, "description");
      }

      if (Object.keys(attributes).length === 0) {
        throw badRequest("At least one field is required", "VALIDATION_ERROR");
      }

      response.json({
        category: contentService.updateCategory(request.params.category_id, attributes)
      });
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

      response.json(contentService.updateMovie(request.params.movie_id, attributes));
    }
  };
}
