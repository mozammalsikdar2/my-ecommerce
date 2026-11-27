export type ImageSignature = "png" | "jpeg" | "webp" | "ico";

const imageSignatures: Record<string, ImageSignature> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

export function getImageSignature(mimeType: string) {
  return imageSignatures[mimeType.toLowerCase()] ?? null;
}

export function hasExpectedImageSignature(
  buffer: Buffer,
  signature: ImageSignature,
) {
  if (signature === "png") {
    return buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (signature === "jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
  if (signature === "webp") {
    return (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }
  return (
    buffer.length >= 6 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  );
}
