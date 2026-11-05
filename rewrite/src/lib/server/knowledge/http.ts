import { ApiError } from "../errors";
import { MAX_UPLOAD_BYTES } from "./extract";
export async function uploadFile(request: Request) {
  const maximum = MAX_UPLOAD_BYTES + 65536;
  if (Number(request.headers.get("content-length")) > maximum)
    throw new ApiError(413, "UPLOAD_TOO_LARGE", "Upload limit is 10 MiB");
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
    throw new ApiError(400, "INVALID_INPUT", "Expected multipart file");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "INVALID_INPUT", "File required");
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maximum) {
      await reader.cancel();
      throw new ApiError(413, "UPLOAD_TOO_LARGE", "Upload limit is 10 MiB");
    }
    parts.push(value);
  }
  let data: FormData;
  try {
    data = await new Response(Buffer.concat(parts), {
      headers: { "content-type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    throw new ApiError(400, "INVALID_INPUT", "Invalid multipart upload");
  }
  const file = data.get("file");
  if (!(file instanceof File) || data.getAll("file").length !== 1)
    throw new ApiError(400, "INVALID_INPUT", "One file required");
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}
