import { DatabaseSync } from "node:sqlite";
import type { ConversationConfig } from "../../contracts";
import { migrate } from "./migrations";

export function openCatalogue(file: string) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL");
  migrate(db);

  function list() {
    const rows = db
      .prepare("SELECT * FROM conversations ORDER BY created_at, id")
      .all() as {
      id: string;
      config: string;
      created_at: string;
      ready: number;
    }[];
    return rows.map((row) => ({
      id: row.id,
      config: JSON.parse(row.config) as ConversationConfig,
      createdAt: row.created_at,
      ready: Boolean(row.ready),
    }));
  }
  return {
    list,
    get(id: string) {
      // Selection reads occur on every public snapshot; avoid scanning the catalogue.
      const row = db
        .prepare("SELECT * FROM conversations WHERE id=?")
        .get(id) as
        | {
            id: string;
            config: string;
            created_at: string;
            ready: number;
          }
        | undefined;
      return row
        ? {
            id: row.id,
            config: JSON.parse(row.config) as ConversationConfig,
            createdAt: row.created_at,
            ready: Boolean(row.ready),
          }
        : undefined;
    },
    insert(id: string, config: ConversationConfig) {
      db.prepare(
        "INSERT INTO conversations(id,config,created_at) VALUES(?,?,?)",
      ).run(id, JSON.stringify(config), new Date().toISOString());
    },
    configure(id: string, config: ConversationConfig) {
      db.prepare("UPDATE conversations SET config=? WHERE id=?").run(
        JSON.stringify(config),
        id,
      );
    },
    ready(id: string) {
      db.prepare("UPDATE conversations SET ready=1 WHERE id=?").run(id);
    },
    close() {
      db.close();
    },
  };
}
