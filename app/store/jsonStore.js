import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

const emptyData = {
  parents: [],
  otpCodes: [],
  children: [],
  devices: [],
  contentCategories: [],
  contentLikes: [],
  childContentBlacklist: [],
  contentTags: [],
  contentMovies: [],
  pairingSessions: [],
  subscriptions: [],
  transactions: [],
  tariffs: [],
  watchLimits: [],
  watchSessions: []
};

export class JsonStore {
  constructor(filePath = config.dataFile) {
    this.filePath = path.resolve(filePath);
    this.data = structuredClone(emptyData);
    this.load();
  }

  load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    if (!fs.existsSync(this.filePath)) {
      this.save();
      return;
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    this.data = { ...structuredClone(emptyData), ...JSON.parse(raw) };
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`);
  }

  all(collection) {
    return this.data[collection] || [];
  }

  findById(collection, id) {
    return this.all(collection).find((record) => record.id === id) || null;
  }

  findOne(collection, predicate) {
    return this.all(collection).find(predicate) || null;
  }

  filter(collection, predicate) {
    return this.all(collection).filter(predicate);
  }

  insert(collection, attributes) {
    const now = new Date().toISOString();
    const record = {
      id: randomUUID(),
      ...attributes,
      createdAt: attributes.createdAt || now,
      updatedAt: attributes.updatedAt || now
    };

    this.data[collection].push(record);
    this.save();

    return record;
  }

  update(collection, id, attributes) {
    const records = this.all(collection);
    const index = records.findIndex((record) => record.id === id);

    if (index === -1) {
      return null;
    }

    records[index] = {
      ...records[index],
      ...attributes,
      updatedAt: new Date().toISOString()
    };

    this.save();

    return records[index];
  }

  delete(collection, id) {
    const records = this.all(collection);
    const index = records.findIndex((record) => record.id === id);

    if (index === -1) {
      return null;
    }

    const [deletedRecord] = records.splice(index, 1);
    this.save();

    return deletedRecord;
  }

  upsertOne(collection, predicate, attributes) {
    const existing = this.findOne(collection, predicate);

    if (existing) {
      return this.update(collection, existing.id, attributes);
    }

    return this.insert(collection, attributes);
  }
}

export const store = new JsonStore();
