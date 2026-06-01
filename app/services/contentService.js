import path from "node:path";
import { conflict, notFound } from "../lib/errors.js";

const catalog = [
  {
    id: "bluey-001",
    title: {
      en: "Bluey - Keepy Uppy",
      ru: "Bluey - Keepy Uppy",
      uz: "Bluey - To'pni ushla"
    },
    type: "cartoon",
    ageRating: "G",
    durationMinutes: 7
  },
  {
    id: "octonauts-001",
    title: {
      en: "Octonauts - The Whale Shark",
      ru: "Octonauts - The Whale Shark",
      uz: "Oktonavtlar - Kit akulasi"
    },
    type: "cartoon",
    ageRating: "G",
    durationMinutes: 12
  },
  {
    id: "storybots-001",
    title: {
      en: "StoryBots - Why Is the Sky Blue?",
      ru: "StoryBots - Why Is the Sky Blue?",
      uz: "StoryBots - Nega osmon ko'k?"
    },
    type: "educational",
    ageRating: "G",
    durationMinutes: 24
  }
];

function toLocalizedText(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      en: value.en || "",
      ru: value.ru || "",
      uz: value.uz || ""
    };
  }

  return {
    en: value || "",
    ru: value || "",
    uz: value || ""
  };
}

function serializeCategory(category) {
  return {
    id: category.id,
    title: toLocalizedText(category.title || category.name),
    description: toLocalizedText(category.description)
  };
}

function sourceUrl(source) {
  if (source?.url) {
    return source.url;
  }

  const fileName = source?.fileName || (source?.path ? path.basename(source.path) : null);

  if (!fileName) {
    return null;
  }

  return `/media/uploads/${encodeURIComponent(fileName)}`;
}

function serializeMovie(movie, series = []) {
  const videoUrl = sourceUrl(movie.source);
  const transcodeStatus = movie.transcode?.status || "missing_source";

  return {
    id: movie.id,
    title: toLocalizedText(movie.title),
    description: toLocalizedText(movie.description),
    series: series.length > 0 ? series.map((item) => serializeMovie(item)) : movie.series || [],
    is_premium: Boolean(movie.is_premium),
    source: videoUrl,
    video_url: videoUrl,
    storage_path: movie.source?.path || null,
    transcode_status: transcodeStatus,
    duration: movie.duration ?? null,
    createdAt: movie.createdAt || null,
    updatedAt: movie.updatedAt || null,
    media: {
      has_source: Boolean(movie.source?.path),
      original_name: movie.source?.originalName || null,
      mime_type: movie.source?.mimeType || null,
      size: movie.source?.size || null,
      storage_path: movie.source?.path || null
    },
    playback: {
      type: "hls",
      status: transcodeStatus,
      hls_url: movie.transcode?.hlsUrl || null,
      error: movie.transcode?.error || null
    }
  };
}

function createSourceFromFile(file) {
  if (!file) {
    return null;
  }

  return {
    path: file.path,
    fileName: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    url: `/media/uploads/${encodeURIComponent(file.filename)}`
  };
}

function initialTranscode(file) {
  if (!file) {
    return {
      status: "missing_source",
      error: null,
      hlsPath: null,
      hlsUrl: null,
      updatedAt: new Date().toISOString()
    };
  }

  return {
    status: "queued",
    error: null,
    hlsPath: null,
    hlsUrl: null,
    updatedAt: new Date().toISOString()
  };
}

function movieAttributes(attributes) {
  return {
    title: attributes.title,
    description: attributes.description,
    series: attributes.series || [],
    is_premium: attributes.is_premium,
    source: createSourceFromFile(attributes.file),
    transcode: initialTranscode(attributes.file)
  };
}

function assertCategoryTitleAvailable(contentCategories, title, currentCategoryId = null) {
  const existingCategory = contentCategories.findByTitle(title);

  if (existingCategory && existingCategory.id !== currentCategoryId) {
    throw conflict("A content category already exists with this title", "CONTENT_CATEGORY_TITLE_EXISTS");
  }
}

export function createContentService({ contentCategories, contentMovies, tariffService, transcoder }) {
  function getCategory(categoryId) {
    const category = contentCategories.findById(categoryId);

    if (!category) {
      throw notFound("Content category not found", "CONTENT_CATEGORY_NOT_FOUND");
    }

    return category;
  }

  function getMovieRecord(movieId) {
    const movie = contentMovies.findById(movieId);

    if (!movie) {
      throw notFound("Content movie not found", "CONTENT_MOVIE_NOT_FOUND");
    }

    return movie;
  }

  function listSeriesRecords(movie) {
    return (movie.series || [])
      .map((movieId) => contentMovies.findById(movieId))
      .filter(Boolean);
  }

  return {
    createCategory({ title, description }) {
      assertCategoryTitleAvailable(contentCategories, title);

      return serializeCategory(contentCategories.create({
        title,
        description
      }));
    },

    deleteCategory(categoryId) {
      const category = getCategory(categoryId);
      const deletedCategory = contentCategories.delete(category.id);

      return {
        deleted: true,
        category: serializeCategory(deletedCategory)
      };
    },

    findContent(contentId) {
      return catalog.find((item) => item.id === contentId) || null;
    },

    addSeriesMovie(parentMovieId, attributes) {
      const parentMovie = getMovieRecord(parentMovieId);
      const seriesMovie = contentMovies.create(movieAttributes({ ...attributes, series: [] }));
      const series = [...(parentMovie.series || []), seriesMovie.id];
      const updatedParentMovie = contentMovies.update(parentMovie.id, { series });

      return {
        movie: serializeMovie(updatedParentMovie, listSeriesRecords(updatedParentMovie)),
        series_item: serializeMovie(seriesMovie)
      };
    },

    createMovie(attributes) {
      let movie = null;

      try {
        movie = contentMovies.create(movieAttributes(attributes));
        const transcodeJob = transcoder.queueMovieTranscode(movie);

        return {
          ...serializeMovie(movie),
          transcode_job_id: transcodeJob?.id || null
        };
      } catch (error) {
        if (movie?.id) {
          contentMovies.delete(movie.id);
        }

        throw error;
      }
    },

    getCategory(categoryId) {
      return serializeCategory(getCategory(categoryId));
    },

    getMovie(actor, movieId) {
      const movie = getMovieRecord(movieId);

      tariffService.assertCanWatchMovie(actor, movie);

      const movieWithTranscode = transcoder.ensureMovieTranscoded(movie);

      return {
        movie: serializeMovie(
          movieWithTranscode,
          listSeriesRecords(movieWithTranscode).filter((item) => tariffService.canWatchMovie(actor, item))
        )
      };
    },

    getMovieSeries(actor, movieId) {
      const movie = getMovieRecord(movieId);

      tariffService.assertCanWatchMovie(actor, movie);

      return {
        movie_id: movie.id,
        series: listSeriesRecords(movie)
          .filter((item) => tariffService.canWatchMovie(actor, item))
          .map((item) => serializeMovie(item))
      };
    },

    listCategories() {
      return {
        categories: contentCategories.list().map(serializeCategory)
      };
    },

    listContent() {
      return catalog;
    },

    listMovies(actor) {
      return {
        movies: contentMovies.list()
          .filter((movie) => tariffService.canWatchMovie(actor, movie))
          .map((movie) => serializeMovie(movie))
      };
    },

    deleteMovie(movieId) {
      const movie = getMovieRecord(movieId);
      const deletedMovie = contentMovies.delete(movie.id);

      transcoder.removeMovieFiles(movie);

      return {
        deleted: true,
        movie: serializeMovie(deletedMovie)
      };
    },

    updateCategory(categoryId, attributes) {
      const category = getCategory(categoryId);

      if (attributes.title) {
        assertCategoryTitleAvailable(contentCategories, attributes.title, category.id);
      }

      return serializeCategory(contentCategories.update(category.id, attributes));
    },

    updateMovie(movieId, attributes) {
      const movie = getMovieRecord(movieId);

      return {
        movie: serializeMovie(contentMovies.update(movie.id, attributes))
      };
    }
  };
}
