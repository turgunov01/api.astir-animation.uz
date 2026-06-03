function serializeTag(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createPostgresContentTagRepository(db) {
  return {
    async list() {
      const rows = await db.many("SELECT * FROM v1_content_tags ORDER BY lower(name), created_at DESC");

      return rows.map(serializeTag);
    },

    async findById(id) {
      return serializeTag(await db.one("SELECT * FROM v1_content_tags WHERE id = $1", [id]));
    },

    async findByName(name) {
      return serializeTag(await db.one("SELECT * FROM v1_content_tags WHERE lower(name) = lower($1)", [name]));
    },

    async findBySlug(slug) {
      return serializeTag(await db.one("SELECT * FROM v1_content_tags WHERE lower(slug) = lower($1)", [slug]));
    },

    async create(attributes) {
      const row = await db.one(
        `
          INSERT INTO v1_content_tags (name, slug, active)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [attributes.name, attributes.slug, attributes.active !== false]
      );

      return serializeTag(row);
    },

    async update(id, attributes) {
      const entries = Object.entries({
        name: attributes.name,
        slug: attributes.slug,
        active: attributes.active
      }).filter(([, value]) => value !== undefined);

      if (entries.length === 0) {
        return this.findById(id);
      }

      const assignments = entries.map(([key], index) => `${key} = $${index + 2}`);
      const values = entries.map(([, value]) => value);
      const row = await db.one(
        `
          UPDATE v1_content_tags
          SET ${assignments.join(", ")}, updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [id, ...values]
      );

      return serializeTag(row);
    },

    async delete(id) {
      return serializeTag(await db.one("DELETE FROM v1_content_tags WHERE id = $1 RETURNING *", [id]));
    }
  };
}
