function serializeTransaction(row) {
  if (!row) {
    return null;
  }

  const createdAt = row.created_at ? new Date(row.created_at).toISOString() : null;
  const updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : null;

  return {
    id: row.id,
    parentId: row.parent_id,
    tariffId: row.tariff_id,
    subscriptionId: row.subscription_id || null,
    subscription_id: row.subscription_id || null,
    provider: row.provider,
    provider_ref: row.provider_ref || null,
    kind: row.kind,
    status: row.status,
    amount: row.amount || null,
    amount_cents: row.amount_cents,
    currency: row.currency,
    description: row.description || null,
    checkout_url: row.checkout_url || null,
    click_trans_id: row.click_trans_id || null,
    click_paydoc_id: row.click_paydoc_id || null,
    merchant_prepare_id: row.merchant_prepare_id || null,
    merchant_confirm_id: row.merchant_confirm_id || null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    processed_at: row.processed_at ? new Date(row.processed_at).toISOString() : null,
    provider_payload: row.provider_payload || null,
    createdAt,
    updatedAt,
    created_at: createdAt,
    updated_at: updatedAt
  };
}

function transactionAttributes(attributes = {}) {
  return {
    parent_id: attributes.parentId ?? attributes.parent_id,
    tariff_id: attributes.tariffId ?? attributes.tariff_id,
    subscription_id: attributes.subscriptionId ?? attributes.subscription_id,
    provider: attributes.provider,
    provider_ref: attributes.provider_ref,
    kind: attributes.kind,
    status: attributes.status,
    amount: attributes.amount,
    amount_cents: attributes.amount_cents,
    currency: attributes.currency,
    description: attributes.description,
    checkout_url: attributes.checkout_url,
    click_trans_id: attributes.click_trans_id,
    click_paydoc_id: attributes.click_paydoc_id,
    merchant_prepare_id: attributes.merchant_prepare_id,
    merchant_confirm_id: attributes.merchant_confirm_id,
    expires_at: attributes.expiresAt ?? attributes.expires_at,
    processed_at: attributes.processed_at,
    provider_payload: attributes.provider_payload
  };
}

function updateEntries(attributes = {}) {
  return Object.entries(transactionAttributes(attributes))
    .filter(([, value]) => value !== undefined);
}

export function createPostgresTransactionRepository(db) {
  const columns = `
    id,
    parent_id,
    tariff_id,
    subscription_id,
    provider,
    provider_ref,
    kind,
    status,
    amount,
    amount_cents,
    currency,
    description,
    checkout_url,
    click_trans_id,
    click_paydoc_id,
    merchant_prepare_id,
    merchant_confirm_id,
    expires_at,
    processed_at,
    provider_payload,
    created_at,
    updated_at
  `;

  return {
    async list() {
      const rows = await db.many(`SELECT ${columns} FROM v1_transactions ORDER BY created_at DESC`);
      return rows.map(serializeTransaction);
    },

    async findById(id) {
      const row = await db.one(`SELECT ${columns} FROM v1_transactions WHERE id = $1`, [id]);
      return serializeTransaction(row);
    },

    async findByProviderRef(provider, providerRef) {
      const row = await db.one(
        `SELECT ${columns} FROM v1_transactions WHERE provider = $1 AND provider_ref = $2`,
        [provider, providerRef]
      );
      return serializeTransaction(row);
    },

    async listByParentId(parentId) {
      const rows = await db.many(
        `SELECT ${columns} FROM v1_transactions WHERE parent_id = $1 ORDER BY created_at DESC`,
        [parentId]
      );
      return rows.map(serializeTransaction);
    },

    async create(attributes) {
      const row = await db.one(
        `
          INSERT INTO v1_transactions (
            parent_id,
            tariff_id,
            provider,
            provider_ref,
            kind,
            status,
            amount,
            amount_cents,
            currency,
            description,
            expires_at,
            provider_payload
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING ${columns}
        `,
        [
          attributes.parentId,
          attributes.tariffId,
          attributes.provider || "click",
          attributes.provider_ref || null,
          attributes.kind || "subscription",
          attributes.status || "pending",
          attributes.amount || null,
          attributes.amount_cents || 0,
          attributes.currency || "UZS",
          attributes.description || null,
          attributes.expiresAt || null,
          attributes.provider_payload || null
        ]
      );
      return serializeTransaction(row);
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
          UPDATE v1_transactions
          SET ${assignments.join(", ")}, updated_at = now()
          WHERE id = $${values.length}
          RETURNING ${columns}
        `,
        values
      );
      return serializeTransaction(row);
    }
  };
}
