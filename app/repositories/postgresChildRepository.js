export function createPostgresChildRepository(db) {
  return {
    async findById(id) {
      const result = await db.query(
        "SELECT id, parent_id as parentId, name, age, avatar_path as avatarPath, avatar_url as avatarUrl, active, created_at as createdAt, updated_at as updatedAt FROM children WHERE id = $1",
        [id]
      );
      return result.rows[0] || null;
    },

    async listByParentId(parentId) {
      const result = await db.query(
        "SELECT id, parent_id as parentId, name, age, avatar_path as avatarPath, avatar_url as avatarUrl, active, created_at as createdAt, updated_at as updatedAt FROM children WHERE parent_id = $1 ORDER BY created_at DESC",
        [parentId]
      );
      return result.rows;
    },

    async findByParentIdAndName(parentId, name) {
      const result = await db.query(
        "SELECT id, parent_id as parentId, name, age, avatar_path as avatarPath, avatar_url as avatarUrl, active, created_at as createdAt, updated_at as updatedAt FROM children WHERE parent_id = $1 AND name = $2",
        [parentId, name]
      );
      return result.rows[0] || null;
    },

    async create(attributes) {
      const result = await db.query(
        "INSERT INTO children (parent_id, name, age, avatar_path, avatar_url, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, parent_id as parentId, name, age, avatar_path as avatarPath, avatar_url as avatarUrl, active, created_at as createdAt, updated_at as updatedAt",
        [attributes.parentId || attributes.parent_id, attributes.name, attributes.age ?? attributes.birthYear ?? attributes.birth_year ?? 0, attributes.avatarPath || attributes.avatar_path || null, attributes.avatarUrl || attributes.avatar_url || null, attributes.active !== false]
      );
      return result.rows[0];
    }
  };
}
