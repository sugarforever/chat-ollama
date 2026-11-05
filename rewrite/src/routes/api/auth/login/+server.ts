import { json, type RequestEvent } from "@sveltejs/kit";
import { login } from "$lib/server/auth";
export async function POST(event: RequestEvent) {
  let password: unknown;
  try {
    password = (await event.request.json()).password;
  } catch {}
  const status = login(event, password);
  return json(
    status === 200
      ? { ok: true }
      : {
          error: {
            code: status === 429 ? "RATE_LIMITED" : "UNAUTHORIZED",
            message: "Login failed",
          },
        },
    { status },
  );
}
