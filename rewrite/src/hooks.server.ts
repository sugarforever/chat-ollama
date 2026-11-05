import { json, redirect, type Handle } from "@sveltejs/kit";
import { requireAdmin } from "$lib/server/auth";
export const handle: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(event.request.method) &&
    event.request.headers.get("origin") !== event.url.origin
  )
    return json(
      { error: { code: "FORBIDDEN", message: "Same-origin request required" } },
      { status: 403 },
    );
  const publicPath = path === "/login" || path === "/api/auth/login";
  if (!publicPath && !path.startsWith("/_app/") && !requireAdmin(event)) {
    if (path.startsWith("/api/") || path.startsWith("/sources/"))
      return json(
        { error: { code: "UNAUTHORIZED", message: "Login required" } },
        { status: 401 },
      );
    redirect(303, "/login");
  }
  return resolve(event);
};
