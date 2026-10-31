import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { RequestEvent } from "@sveltejs/kit";
import { appDatabase } from "./settings";
export type AdminSession = { expiresAt: number };
const state = globalThis as typeof globalThis & {
  __adminAuth?: {
    salt: Buffer;
    hash: Buffer;
    attempts: Map<string, { count: number; until: number }>;
  };
};
function auth() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw Error("ADMIN_PASSWORD is required");
  return (state.__adminAuth ??= (() => {
    const salt = randomBytes(32);
    return { salt, hash: scryptSync(password, salt, 64), attempts: new Map() };
  })());
}
function db() {
  const value = appDatabase();
  value.exec(
    "CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL)",
  );
  return value;
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function requireAdmin(event: RequestEvent): AdminSession | undefined {
  auth();
  const token = event.cookies.get("admin_session");
  if (!token) return;
  const database = db();
  try {
    const now = Date.now();
    database.prepare("DELETE FROM admin_sessions WHERE expires<=?").run(now);
    const row = database
      .prepare("SELECT expires FROM admin_sessions WHERE token=?")
      .get(digest(token)) as { expires: number } | undefined;
    return row && { expiresAt: row.expires };
  } finally {
    database.close();
  }
}
export function login(event: RequestEvent, password: unknown) {
  const owner = auth();
  const ip = event.getClientAddress();
  const now = Date.now();
  let attempts = owner.attempts.get(ip);
  if (attempts && attempts.until <= now) {
    owner.attempts.delete(ip);
    attempts = undefined;
  }
  if (attempts && attempts.count >= 5) return 429;
  if (
    typeof password !== "string" ||
    password.length > 4096 ||
    !timingSafeEqual(scryptSync(password, owner.salt, 64), owner.hash)
  ) {
    owner.attempts.set(ip, {
      count: (attempts?.count || 0) + 1,
      until: attempts?.until || now + 900000,
    });
    return 401;
  }
  owner.attempts.delete(ip);
  const token = randomBytes(32).toString("base64url");
  const expires = now + 86400000;
  const database = db();
  try {
    database
      .prepare("INSERT INTO admin_sessions VALUES (?,?)")
      .run(digest(token), expires);
  } finally {
    database.close();
  }
  event.cookies.set("admin_session", token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: event.url.protocol === "https:",
    maxAge: 86400,
  });
  return 200;
}
export function logout(event: RequestEvent) {
  const token = event.cookies.get("admin_session");
  if (token) {
    const database = db();
    try {
      database
        .prepare("DELETE FROM admin_sessions WHERE token=?")
        .run(digest(token));
    } finally {
      database.close();
    }
  }
  event.cookies.delete("admin_session", { path: "/" });
}
