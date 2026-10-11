// Keeps a tag's `active` flag in step with whether it has content: a tag
// switches off when its last movie loses it and back on when it gets its
// first movie. Wraps every movie↔tag mutation of the link repository.
export function withTagActivitySync(movieTags, contentTags) {
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
    replaceForMovie: (movieId, tagIds) => sync(() => movieTags.replaceForMovie(movieId, tagIds)),
    removeMovie: (movieId) => sync(() => movieTags.removeMovie(movieId))
  };
}
