import { json } from "@sveltejs/kit";
import { publicSettings, saveSettings } from "$lib/server/settings";
export const GET = () => json(publicSettings());
export async function POST({ request }: { request: Request }) {
  try {
    return json(saveSettings(await request.json()));
  } catch {
    return json(
      {
        error: { code: "INVALID_INPUT", message: "Invalid endpoint settings" },
      },
      { status: 400 },
    );
  }
}
