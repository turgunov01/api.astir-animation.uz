function serializeSubscription(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    parentId: row.parent_id,
    tariffId: row.tariff_id,
    provider: row.provider,
    providerSubscriptionId: row.provider_subscription_id,
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    providerPayload: row.provider_payload || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

function subscriptionAttributes(attributes = {}) {
  return {
    parent_id: attributes.parentId ?? attributes.parent_id,
    tariff_id: attributes.tariffId ?? attributes.tariff_id,
    provider: attributes.provider,
    provider_subscription_id: attributes.providerSubscriptionId ?? attributes.provider_subscription_id,
    status: attributes.status,
    started_at: attributes.startedAt ?? attributes.started_at,
    expires_at: attributes.expiresAt ?? attributes.expires_at,
    provider_payload: attributes.providerPayload ?? attributes.provider_payload
  };
}

function updateEntries(attributes = {}) {
  return Object.entries(subscriptionAttributes(attributes))
    .filter(([, value]) => value !== undefined);
}

export function createPostgresSubscriptionRepository(db) {
  const columns = `
    id,
    parent_id,
    tariff_id,
    provider,
    provider_subscription_id,
    status,
    started_at,
    expires_at,
    provider_payload,
    created_at,
    updated_at
  `;

  return {
    async list() {
      const rows = await db.many(`SELECT ${columns} FROM v1_subscriptions ORDER BY created_at DESC`);
      return rows.map(serializeSubscription);
    },

    async findById(id) {
      const row = await db.one(`SELECT ${columns} FROM v1_subscriptions WHERE id = $1`, [id]);
      return serializeSubscription(row);
    },

    async findByProviderSubscriptionId(provider, providerSubscriptionId) {
      const row = await db.one(
        `SELECT ${columns} FROM v1_subscriptions WHERE provider = $1 AND provider_subscription_id = $2`,
        [provider, providerSubscriptionId]
      );
      return serializeSubscription(row);
    },

    async listByParentId(parentId) {
      const rows = await db.many(
        `SELECT ${columns} FROM v1_subscriptions WHERE parent_id = $1 ORDER BY created_at DESC`,
        [parentId]
      );
      return rows.map(serializeSubscription);
    },

    async listByTariffId(tariffId) {
      const rows = await db.many(
        `SELECT ${columns} FROM v1_subscriptions WHERE tariff_id = $1 ORDER BY created_at DESC`,
        [tariffId]
      );
      return rows.map(serializeSubscription);
    },

    async create(attributes) {
      const row = await db.one(
        `
          INSERT INTO v1_subscriptions (
            parent_id,
            tariff_id,
            provider,
            provider_subscription_id,
            status,
            started_at,
            expires_at,
            provider_payload
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING ${columns}
        `,
        [
          attributes.parentId,
          attributes.tariffId,
          attributes.provider,
          attributes.providerSubscriptionId,
          attributes.status || "active",
          attributes.startedAt || null,
          attributes.expiresAt,
          attributes.providerPayload || null
        ]
      );
      return serializeSubscription(row);
    },

    async update(id, attributes) {
      const entries = updateEntries(attributes);

      if (entries.length === 0) {
        return this.findById(id);
      }

      const values = entries.map(([, value]) => value);
      const assignments = entries.map(([field], index) => `${field} = $${index + 1}`);

      values.push(id);
      const row = await db.one(
        `
          UPDATE v1_subscriptions
          SET ${assignments.join(", ")}, updated_at = now()
          WHERE id = $${values.length}
          RETURNING ${columns}
        `,
        values
      );
      return serializeSubscription(row);
    }
  };
}
