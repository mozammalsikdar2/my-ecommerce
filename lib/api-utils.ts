export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export type LimitedTextBodyResult =
  | { ok: true; text: string }
  | { ok: false; status: 400 | 413; error: string };

export async function readLimitedTextBody(
  request: Request,
  maxBytes: number,
): Promise<LimitedTextBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > maxBytes
  ) {
    return { ok: false, status: 413, error: "Request body is too large" };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: true, text: "" };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch (error) {
          console.warn("Unable to cancel oversized request body:", error);
        }
        return { ok: false, status: 413, error: "Request body is too large" };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { ok: false, status: 400, error: "Invalid request body" };
  } finally {
    reader.releaseLock();
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
