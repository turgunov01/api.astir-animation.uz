export function createPostgresParentRepository(db) {
  const parentColumns = `
    id,
    email,
    password_hash as "passwordHash",
    pin_hash as "pinHash",
    name,
    role,
    active,
    avatar_url as "avatarUrl",
    tariff,
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;

  return {
    async findById(id) {
      const result = await db.query(
        `SELECT ${parentColumns} FROM users WHERE id = $1 AND role = 'parent'`,
        [id]
      );
      return result.rows[0] || null;
    },

    async findByEmail(email) {
      const result = await db.query(
        `SELECT ${parentColumns} FROM users WHERE email = $1 AND role = 'parent'`,
        [email]
      );
      return result.rows[0] || null;
    },

    async list() {
      const result = await db.query(
        `SELECT ${parentColumns} FROM users WHERE role = 'parent' ORDER BY created_at DESC`
      );
      return result.rows;
    },

    async create(attributes) {
      const result = await db.query(
        `
          INSERT INTO users (email, password_hash, pin_hash, name, avatar_url, role, tariff)
          VALUES ($1, $2, $3, $4, $5, 'parent', $6)
          RETURNING ${parentColumns}
        `,
        [
          attributes.email,
          attributes.passwordHash || attributes.password_hash || null,
          attributes.pinHash || attributes.pin_hash || null,
          attributes.name || "",
          attributes.avatarUrl || attributes.avatar_url || null,
          attributes.tariff || "free"
        ]
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

      const passwordHash = attributes.passwordHash ?? attributes.password_hash;
      if (passwordHash !== undefined) {
        values.push(passwordHash);
        assignments.push(`password_hash = $${values.length}`);
      }

      const pinHash = attributes.pinHash ?? attributes.pin_hash;
      if (pinHash !== undefined) {
        values.push(pinHash);
        assignments.push(`pin_hash = $${values.length}`);
      }

      const avatarUrl = attributes.avatarUrl ?? attributes.avatar_url;
      if (avatarUrl !== undefined) {
        values.push(avatarUrl);
        assignments.push(`avatar_url = $${values.length}`);
      }

      if (Object.hasOwn(attributes, "tariff")) {
        values.push(attributes.tariff);
        assignments.push(`tariff = $${values.length}`);
      }

      if (assignments.length === 0) {
        return this.findById(id);
      }

      values.push(id);
      const result = await db.query(
        `
          UPDATE users
          SET ${assignments.join(", ")}, updated_at = now()
          WHERE id = $${values.length} AND role = 'parent'
          RETURNING ${parentColumns}
        `,
        values
      );
      return result.rows[0] || null;
    }
  };
}
