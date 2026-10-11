// Keeps a tag's `active` flag in step with whether it has content: a tag
// switches off when its last movie loses it and back on when it gets its
// first movie. Wraps every movie↔tag mutation of the link repository.
// It also mirrors a movie's tag ids onto the movie record, so tariff rules
// ("unlocks these tags") can be checked without a database round trip.
export function withTagActivitySync(movieTags, contentTags, contentMovies = null) {
  if (!movieTags?.countByTag) {
    return movieTags;
  }

  async function sync(mutation) {
    const before = await movieTags.countByTag();
    const result = await mutation();
    const after = await movieTags.countByTag();

    for (const tagId of new Set([...before.keys(), ...after.keys()])) {
      const was = before.get(tagId) || 0;
      const now = after.get(tagId) || 0;

      if (was > 0 && now === 0) {
        await contentTags.update(tagId, { active: false });
      } else if (was === 0 && now > 0) {
        await contentTags.update(tagId, { active: true });
      }
    }

    return result;
  }

  return {
    ...movieTags,
    replaceForMovie: async (movieId, tagIds) => {
      const result = await sync(() => movieTags.replaceForMovie(movieId, tagIds));
      if (contentMovies?.findById?.(movieId)) contentMovies.update(movieId, { tag_ids: [...new Set(tagIds)] });
      return result;
    },
    removeMovie: (movieId) => sync(() => movieTags.removeMovie(movieId)),
    removeTag: async (tagId) => {
      await movieTags.removeTag(tagId);
      for (const movie of contentMovies?.list?.() || []) {
        if ((movie.tag_ids || []).includes(tagId)) {
          contentMovies.update(movie.id, { tag_ids: movie.tag_ids.filter((id) => id !== tagId) });
        }
      }
    }
  };
}
