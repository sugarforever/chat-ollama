import { json } from "@sveltejs/kit";
import { api, body } from "$lib/server/api";
import { publicMcpServers, saveMcpServers } from "$lib/server/mcp/config";
export const GET = () => api(() => json({ servers: publicMcpServers() }));
// This replaces the complete list, including secrets; GET only returns presence flags.
export const PUT = ({ request }: { request: Request }) =>
  api(async () =>
    json({ servers: saveMcpServers((await body(request)).servers) }),
  );
