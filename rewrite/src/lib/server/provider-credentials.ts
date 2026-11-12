import { randomUUID } from "node:crypto";
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { appDatabase } from "./settings";
function database() {
  const db = appDatabase();
  db.exec(
    "CREATE TABLE IF NOT EXISTS provider_credentials (slot TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS credential_locks (slot TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL)",
  );
  return db;
}
export function readCredential(slot: string): Credential | undefined {
  const db = database();
  try {
    const row = db
      .prepare("SELECT value FROM provider_credentials WHERE slot=?")
      .get(slot) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  } finally {
    db.close();
  }
}
// SQLite leases serialize token rotation across bundles/processes without holding a DB transaction over network I/O.
async function locked<T>(
  slot: string,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const owner = randomUUID();
  const db = database();
  try {
    for (;;) {
      signal?.throwIfAborted();
      const now = Date.now();
      const result = db
        .prepare(
          "INSERT INTO credential_locks VALUES (?,?,?) ON CONFLICT(slot) DO UPDATE SET owner=excluded.owner, expires=excluded.expires WHERE credential_locks.expires < ?",
        )
        .run(slot, owner, now + 15000, now);
      if (result.changes) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    const heartbeat = setInterval(() => {
      db.prepare(
        "UPDATE credential_locks SET expires=? WHERE slot=? AND owner=?",
      ).run(Date.now() + 15000, slot, owner);
    }, 4000);
    heartbeat.unref();
    try {
      return await fn();
    } finally {
      clearInterval(heartbeat);
      db.prepare("DELETE FROM credential_locks WHERE slot=? AND owner=?").run(
        slot,
        owner,
      );
    }
  } finally {
    db.close();
  }
}
export function credentialStore(slot: string): CredentialStore {
  return {
    async read() {
      return readCredential(slot);
    },
    async list() {
      const c = readCredential(slot);
      return c ? [{ providerId: slot, type: c.type }] : [];
    },
    async modify(_id, fn, options) {
      return locked(
        slot,
        async () => {
          const next = await fn(readCredential(slot));
          options?.signal?.throwIfAborted();
          if (next) {
            const db = database();
            try {
              db.prepare(
                "INSERT OR REPLACE INTO provider_credentials VALUES (?,?)",
              ).run(slot, JSON.stringify(next));
            } finally {
              db.close();
            }
          }
          return next ?? readCredential(slot);
        },
        options?.signal,
      );
    },
    async delete(_id, options) {
      await locked(
        slot,
        async () => {
          const db = database();
          try {
            db.prepare("DELETE FROM provider_credentials WHERE slot=?").run(
              slot,
            );
          } finally {
            db.close();
          }
        },
        options?.signal,
      );
    },
  };
}
