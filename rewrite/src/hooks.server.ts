import { json, type Handle } from "@sveltejs/kit";
export const handle: Handle = async ({ event, resolve }) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(event.request.method) &&
    event.request.headers.get("origin") !== event.url.origin
  )
    return json(
      { error: { code: "FORBIDDEN", message: "Same-origin request required" } },
      { status: 403 },
    );
  return resolve(event);
};
