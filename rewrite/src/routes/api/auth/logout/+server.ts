import { json, type RequestEvent } from "@sveltejs/kit";
import { logout } from "$lib/server/auth";
export function POST(event: RequestEvent) {
  logout(event);
  return json({ ok: true });
}
