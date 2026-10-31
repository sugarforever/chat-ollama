import { DatabaseSync } from "node:sqlite";
import { chmodSync } from "node:fs";
import { ApiError } from "../errors";
// The marker is flushed before any external call. A crash between result commit and
// marker cleanup conservatively requires acknowledgement; it never permits a retry.
export function openMcpBarrier(file: string) {
  const db = new DatabaseSync(file);
  chmodSync(file, 0o600);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS barrier(id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, state TEXT NOT NULL, call_id TEXT NOT NULL)",
  );
  db.exec("UPDATE barrier SET state='uncertain'");
  const read = () =>
    db.prepare("SELECT name,state,call_id FROM barrier WHERE id=1").get() as
      | { name: string; state: string; call_id: string }
      | undefined;
  return {
    uncertainty() {
      const row = read();
      return row?.state === "uncertain"
        ? `MCP action ${row.name} may have completed. Check the external system and explicitly acknowledge before continuing.`
        : undefined;
    },
    begin(name: string, callId: string) {
      if (read())
        throw new ApiError(
          409,
          "MCP_UNCERTAIN",
          "Acknowledge the uncertain MCP action first",
        );
      db.prepare("INSERT INTO barrier VALUES(1,?,'inflight',?)").run(
        name,
        callId,
      );
    },
    complete() {
      db.exec("UPDATE barrier SET state='returned'");
    },
    fail() {
      db.exec("UPDATE barrier SET state='uncertain'");
    },
    committed(callIds: string[]) {
      const row = read();
      if (row?.state === "returned" && callIds.includes(row.call_id))
        db.exec("DELETE FROM barrier");
    },
    acknowledge() {
      db.exec("DELETE FROM barrier WHERE state='uncertain'");
    },
    close() {
      db.close();
    },
  };
}
