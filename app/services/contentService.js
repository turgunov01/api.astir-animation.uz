import fs from "node:fs";
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
  const iconUrl = sourceUrl(category.icon);

  return {
    id: category.id,
    title: toLocalizedText(category.title || category.name),
    description: toLocalizedText(category.description),
    type: category.type || category.kind || "other",
    slug: category.slug || slugify(category.title || category.name, "category"),
    active: category.active !== false,
    icon_url: iconUrl,
    icon: category.icon
      ? {
          url: iconUrl,
          storage_path: category.icon.path || null,
          original_name: category.icon.originalName || null,
          mime_type: category.icon.mimeType || null,
          size: category.icon.size || null
        }
      : null
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

function serializeRenditions(renditions = []) {
  return renditions.map((rendition) => ({
    quality: rendition.quality || String(rendition.height || ""),
    label: rendition.label || (rendition.height ? `${rendition.height}p` : ""),
    width: rendition.width || null,
    height: rendition.height || null,
    bitrate: rendition.bitrate || null,
    playlist_url: rendition.playlist_url || rendition.playlistUrl || null
  }));
}

function serializeMovie(movie, series = []) {
  const videoUrl = sourceUrl(movie.source);
  const transcodeStatus = movie.transcode?.status || "missing_source";
  const hlsUrl = movie.transcode?.hlsUrl || null;
  const renditions = serializeRenditions(movie.transcode?.renditions);
  const qualities = hlsUrl || renditions.length > 0
    ? ["auto", ...renditions.map((rendition) => rendition.quality)]
    : [];

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
      hls_url: hlsUrl,
      auto_url: hlsUrl,
      qualities,
      renditions,
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

function removeStoredFile(source) {
  if (!source?.path) {
    return;
  }

  fs.rmSync(source.path, { force: true });
}

function slugify(value, fallback = "category") {
  const source = typeof value === "string"
    ? value
    : value?.en || value?.ru || value?.uz || fallback;
  const slug = String(source)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function assertCategorySlugAvailable(contentCategories, slug, currentCategoryId = null) {
  const existingCategory = contentCategories.findBySlug(slug);

  if (existingCategory && existingCategory.id !== currentCategoryId) {
    throw conflict("A content category already exists with this slug", "CONTENT_CATEGORY_SLUG_EXISTS");
  }
}

function uniqueCategorySlug(contentCategories, value, currentCategoryId = null) {
  const baseSlug = slugify(value, "category");
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existingCategory = contentCategories.findBySlug(slug);

    if (!existingCategory || existingCategory.id === currentCategoryId) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

function categoryAttributes(attributes) {
  return {
    title: attributes.title,
    description: attributes.description,
    type: attributes.type || "other",
    slug: attributes.slug,
    active: attributes.active !== false,
    icon: createSourceFromFile(attributes.file)
  };
}

function initialTranscode(file) {
  if (!file) {
    return {
      status: "missing_source",
      error: null,
      hlsPath: null,
      hlsUrl: null,
      renditions: [],
      updatedAt: new Date().toISOString()
    };
  }

  return {
    status: "queued",
    error: null,
    hlsPath: null,
    hlsUrl: null,
    renditions: [],
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

  function collectMovieTree(movie, seenMovieIds = new Set()) {
    if (!movie || seenMovieIds.has(movie.id)) {
      return [];
    }

    seenMovieIds.add(movie.id);

    return [
      movie,
      ...listSeriesRecords(movie).flatMap((seriesMovie) => collectMovieTree(seriesMovie, seenMovieIds))
    ];
  }

  return {
    createCategory({ title, description, type, slug, active, file }) {
      assertCategoryTitleAvailable(contentCategories, title);
      const categorySlug = slug ? slugify(slug, "category") : uniqueCategorySlug(contentCategories, title);

      if (slug) {
        assertCategorySlugAvailable(contentCategories, categorySlug);
      }

      return serializeCategory(contentCategories.create(categoryAttributes({
        title,
        description,
        type,
        slug: categorySlug,
        active,
        file
      })));
    },

    deleteCategory(categoryId) {
      const category = getCategory(categoryId);
      const deletedCategory = contentCategories.delete(category.id);

      removeStoredFile(deletedCategory.icon);

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
      let seriesMovie = null;

      try {
        seriesMovie = contentMovies.create(movieAttributes({ ...attributes, series: [] }));
        const transcodeJob = transcoder.queueMovieTranscode(seriesMovie);
        const series = [...(parentMovie.series || []), seriesMovie.id];
        const updatedParentMovie = contentMovies.update(parentMovie.id, { series });

        return {
          movie: serializeMovie(updatedParentMovie, listSeriesRecords(updatedParentMovie)),
          series_item: serializeMovie(seriesMovie),
          transcode_job_id: transcodeJob?.id || null
        };
      } catch (error) {
        if (seriesMovie?.id) {
          contentMovies.delete(seriesMovie.id);
          transcoder.removeMovieFiles(seriesMovie);
        }

        throw error;
      }
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
          transcoder.removeMovieFiles(movie);
        } else if (attributes.file?.path) {
          transcoder.removeMovieFiles({
            id: null,
            source: { path: attributes.file.path }
          });
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
      const moviesToDelete = collectMovieTree(movie);
      let deletedMovie = null;

      for (const movieToDelete of moviesToDelete) {
        const deleted = contentMovies.delete(movieToDelete.id);

        if (deleted) {
          transcoder.removeMovieFiles(movieToDelete);
        }

        if (movieToDelete.id === movie.id) {
          deletedMovie = deleted;
        }
      }

      const deletedMovieIds = new Set(moviesToDelete.map((movieToDelete) => movieToDelete.id));

      for (const parentMovie of contentMovies.list()) {
        if ((parentMovie.series || []).some((seriesMovieId) => deletedMovieIds.has(seriesMovieId))) {
          contentMovies.update(parentMovie.id, {
            series: parentMovie.series.filter((seriesMovieId) => !deletedMovieIds.has(seriesMovieId))
          });
        }
      }

      return {
        deleted: true,
        movie: serializeMovie(deletedMovie)
      };
    },

    updateCategory(categoryId, attributes) {
      const category = getCategory(categoryId);
      const categoryUpdates = { ...attributes };

      if (categoryUpdates.title) {
        assertCategoryTitleAvailable(contentCategories, categoryUpdates.title, category.id);
      }

      if (Object.hasOwn(categoryUpdates, "slug")) {
        categoryUpdates.slug = slugify(categoryUpdates.slug, "category");
        assertCategorySlugAvailable(contentCategories, categoryUpdates.slug, category.id);
      }

      if (Object.hasOwn(categoryUpdates, "file")) {
        categoryUpdates.icon = createSourceFromFile(categoryUpdates.file);
        delete categoryUpdates.file;
      }

      const updatedCategory = contentCategories.update(category.id, categoryUpdates);

      if (categoryUpdates.icon) {
        removeStoredFile(category.icon);
      }

      return serializeCategory(updatedCategory);
    },

    updateMovie(movieId, attributes) {
      const movie = getMovieRecord(movieId);

      return {
        movie: serializeMovie(contentMovies.update(movie.id, attributes))
      };
    }
  };
}
