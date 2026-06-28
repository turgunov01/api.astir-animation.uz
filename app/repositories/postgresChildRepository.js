export function createPostgresChildRepository(db) {
  const selectColumns = `id,
    parent_id as "parentId",
    name,
    age,
    avatar_path as "avatarPath",
    avatar_url as "avatarUrl",
    active,
    extended_until as "extendedUntil",
    created_at as "createdAt",
    updated_at as "updatedAt"`;

  return {
    async findById(id) {
      const result = await db.query(
        `SELECT ${selectColumns} FROM children WHERE id = $1`,
        [id]
      );
      return result.rows[0] || null;
    },

    async listByParentId(parentId) {
      const result = await db.query(
        `SELECT ${selectColumns} FROM children WHERE parent_id = $1 ORDER BY created_at DESC`,
        [parentId]
      );
      return result.rows;
    },

    async findByParentIdAndName(parentId, name) {
      const result = await db.query(
        `SELECT ${selectColumns} FROM children WHERE parent_id = $1 AND name = $2`,
        [parentId, name]
      );
      return result.rows[0] || null;
    },

    async create(attributes) {
      const result = await db.query(
        `INSERT INTO children (parent_id, name, age, avatar_path, avatar_url, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${selectColumns}`,
        [attributes.parentId || attributes.parent_id, attributes.name, attributes.age ?? attributes.birthYear ?? attributes.birth_year ?? 0, attributes.avatarPath || attributes.avatar_path || null, attributes.avatarUrl || attributes.avatar_url || null, attributes.active !== false]
      );
      return result.rows[0];
    },

    async clearWatchExtensionById(id) {
      const result = await db.query(
        `UPDATE children SET extended_until = NULL, updated_at = now() WHERE id = $1 RETURNING ${selectColumns}`,
        [id]
      );
      return result.rows[0] || null;
    }
  };
}
