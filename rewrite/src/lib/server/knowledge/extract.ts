export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export type Passage = { text: string; page?: number };
export async function extract(
  bytes: Uint8Array,
  extension: string,
): Promise<Passage[]> {
  let pages: Passage[];
  if (extension === "pdf") {
    try {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const document = await getDocument({
        data: new Uint8Array(bytes),
        useSystemFonts: true,
        isEvalSupported: false,
      }).promise;
      try {
        if (document.numPages > 1000) throw Error("PDF exceeds 1000 pages");
        pages = [];
        for (let page = 1; page <= document.numPages; page++) {
          const content = await (await document.getPage(page)).getTextContent();
          const text = content.items
            .map((item) =>
              "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
            )
            .join("");
          pages.push({ page, text });
        }
      } finally {
        await document.destroy();
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("1000")) throw error;
      throw Error("Cannot extract PDF text; use an unencrypted text-based PDF");
    }
    if (!pages.some((p) => p.text.trim()))
      throw Error("PDF has no text layer; OCR is not supported");
  } else {
    try {
      pages = [
        { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) },
      ];
    } catch {
      throw Error("Text files must use UTF-8");
    }
  }
  if (pages.reduce((n, p) => n + p.text.length, 0) > 2_000_000)
    throw Error("Extracted text exceeds 2 million characters");
  const result: Passage[] = [];
  for (const page of pages) {
    const text = page.text.replace(/\r\n?/g, "\n").replace(/\0/g, "").trim();
    for (let start = 0; start < text.length; ) {
      let end = Math.min(start + 1200, text.length);
      if (end < text.length) {
        const paragraph = text.lastIndexOf("\n\n", end);
        if (paragraph > start + 600) end = paragraph;
        else {
          const sentence = Math.max(
            text.lastIndexOf("。", end),
            text.lastIndexOf(". ", end),
          );
          if (sentence > start + 600) end = sentence + 1;
        }
      }
      const chunk = text.slice(start, end).trim();
      if (chunk) result.push({ text: chunk, page: page.page });
      if (end === text.length) break;
      start = Math.max(start + 1, end - 150);
    }
  }
  if (!result.length) throw Error("Document contains no text");
  return result;
}
