export function createPostgresParentRepository(db) {
  return {
    async findById(id) {
      const result = await db.query(
        "SELECT id, email, name, avatar_url as avatarUrl, created_at as createdAt, updated_at as updatedAt FROM users WHERE id = $1 AND role = 'parent'",
        [id]
      );
      return result.rows[0] || null;
    },

    async findByEmail(email) {
      const result = await db.query(
        "SELECT id, email, name, avatar_url as avatarUrl, created_at as createdAt, updated_at as updatedAt FROM users WHERE email = $1 AND role = 'parent'",
        [email]
      );
      return result.rows[0] || null;
    },

    async list() {
      const result = await db.query(
        "SELECT id, email, name, avatar_url as avatarUrl, created_at as createdAt, updated_at as updatedAt FROM users WHERE role = 'parent' ORDER BY created_at DESC"
      );
      return result.rows;
    },

    async create(attributes) {
      const result = await db.query(
        "INSERT INTO users (email, name, avatar_url, role) VALUES ($1, $2, $3, 'parent') RETURNING id, email, name, avatar_url as avatarUrl, created_at as createdAt, updated_at as updatedAt",
        [attributes.email, attributes.name || '', attributes.avatarUrl || attributes.avatar_url || null]
      );
      return result.rows[0];
    },

    async update(id, attributes) {
      const assignments = [];
      const values = [];

      if (Object.hasOwn(attributes, "name")) {
        values.push(attributes.name);
        assignments.push(`name = $${values.length}`);
      }

      const avatarUrl = attributes.avatarUrl ?? attributes.avatar_url;
      if (avatarUrl !== undefined) {
        values.push(avatarUrl);
        assignments.push(`avatar_url = $${values.length}`);
      }

      if (assignments.length === 0) {
        const parent = await this.findById(id);

        return parent && Object.hasOwn(attributes, "tariff")
          ? { ...parent, tariff: attributes.tariff }
          : parent;
      }

      values.push(id);
      const result = await db.query(
        `
          UPDATE users
          SET ${assignments.join(", ")}, updated_at = now()
          WHERE id = $${values.length} AND role = 'parent'
          RETURNING id, email, name, avatar_url as avatarUrl, created_at as createdAt, updated_at as updatedAt
        `,
        values
      );
      const parent = result.rows[0] || null;

      return parent && Object.hasOwn(attributes, "tariff")
        ? { ...parent, tariff: attributes.tariff }
        : parent;
    }
  };
}
