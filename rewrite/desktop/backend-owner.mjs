import { DatabaseSync } from "node:sqlite";
import {
  chmodSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// Hold an OS-managed SQLite lock, never a PID file that needs stale-lock deletion.
// Every production server acquires this before importing application storage.
export function acquireBackendOwner(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  directory = realpathSync(directory);
  const file = join(directory, ".backend-lock.sqlite");
  const db = new DatabaseSync(file);
  chmodSync(file, 0o600);
  try {
    db.exec("BEGIN EXCLUSIVE");
  } catch (cause) {
    db.close();
    if (cause.errcode !== 5) throw cause;
    throw Object.assign(new Error("Another backend owns this data directory"), {
      code: "BACKEND_IN_USE",
    });
  }
  const descriptor = join(directory, "backend.json");
  // A previous owner may have crashed. Only the lock holder can replace this.
  rmSync(descriptor, { force: true });
  let closed = false;
  return {
    directory,
    publish(value) {
      if (closed) throw new Error("Backend owner is closed");
      const temporary = `${descriptor}.tmp`;
      writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
      chmodSync(temporary, 0o600);
      renameSync(temporary, descriptor);
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        rmSync(descriptor, { force: true });
      } finally {
        db.close();
      }
    },
  };
}
