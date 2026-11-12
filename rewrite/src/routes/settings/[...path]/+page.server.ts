import { randomUUID } from "node:crypto";
import { error, redirect } from "@sveltejs/kit";
import { loadProviders } from "$lib/server/settings";
import { providerCatalog } from "$lib/server/providers";
export const load = ({
  params,
  url,
}: {
  params: { path: string };
  url: URL;
}) => {
  const parts = params.path.split("/");
  const tab = parts[0];
  if (tab === "chat" && parts.length === 1) redirect(303, "/settings/providers");
  if (!["providers", "embeddings", "knowledge", "tools"].includes(tab))
    error(404, "Settings page not found");
  let editorId = "",
    newService = "",
    newAuth = "",
    draftId = "",
    catalogOpen = false;
  if (tab !== "providers" && parts.length !== 1)
    error(404, "Settings page not found");
  if (tab === "providers" && parts.length > 1) {
    if (parts[1] === "new") {
      if (parts.length === 2) catalogOpen = true;
      else if (parts.length === 3) {
        newService = parts[2];
        newAuth =
          url.searchParams.get("auth") ||
          providerCatalog().find((p) => p.id === newService)?.authModes[0] ||
          "api_key";
        draftId = url.searchParams.get("draft") ?? "";
        const preset = providerCatalog().find((p) => p.id === newService);
        if (
          newService !== "custom" &&
          (!preset?.models.length || !preset.authModes.includes(newAuth as any))
        )
          error(404, "Provider not found");
        if (newService === "custom" && !["api_key", "none"].includes(newAuth))
          error(404, "Authentication mode not found");
        if (!draftId) {
          const next = new URL(url);
          next.searchParams.set("draft", randomUUID());
          next.searchParams.set("auth", newAuth);
          redirect(307, next.pathname + next.search);
        }
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(draftId))
          error(404, "Connection draft not found");
      } else error(404, "Provider page not found");
    } else {
      if (
        parts.length !== 2 ||
        !loadProviders().providers.some((p) => p.id === parts[1])
      )
        error(404, "Connection not found");
      editorId = parts[1];
    }
  }
  return {
    tab,
    editorId,
    newService,
    newAuth,
    draftId,
    catalogOpen,
    saved: url.searchParams.get("saved") === "1",
    routeKey: url.pathname + url.search,
  };
};
