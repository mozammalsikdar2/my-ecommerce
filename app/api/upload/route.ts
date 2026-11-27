import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { requireRole } from "@/lib/auth-guard";
import {
  getImageSignature,
  hasExpectedImageSignature,
} from "@/lib/image-signature";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const allowedFolders = new Set([
  "ecommerce-products",
  "ecommerce-categories",
  "store-assets",
  "homepage-banners",
]);
export async function POST(request: Request) {
  const { errorResponse } = await requireRole(
    ["ADMIN", "MODERATOR"],
    request,
  );
  if (errorResponse) return errorResponse;

  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_FILE_SIZE + 64 * 1024
  ) {
    return NextResponse.json(
      { error: "Image must be 5 MB or smaller" },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must contain valid multipart form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  const requestedFolder = formData.get("folder");
  const folder = requestedFolder === null ? "ecommerce-products" : requestedFolder;
  if (typeof folder !== "string" || !allowedFolders.has(folder)) {
    return NextResponse.json({ error: "Invalid upload folder" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Uploaded image is empty" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Image must be 5 MB or smaller" },
      { status: 413 },
    );
  }

  const signature = getImageSignature(file.type);
  if (!signature) {
    return NextResponse.json(
      { error: "Only PNG, JPG, WEBP, or ICO images are allowed" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasExpectedImageSignature(buffer, signature)) {
    return NextResponse.json(
      { error: "Uploaded file does not match its image type" },
      { status: 400 },
    );
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Cloudinary storage is not configured" },
      { status: 503 },
    );
  }

  try {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    const result = await new Promise<{
      secure_url: string;
      public_id: string;
    }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: randomUUID(),
          resource_type: "image",
          overwrite: false,
          transformation: [{ quality: "auto", fetch_format: "auto" }],
        },
        (error, uploadResult) => {
          if (error || !uploadResult) {
            reject(error ?? new Error("Cloudinary upload failed"));
            return;
          }
          resolve({
            secure_url: uploadResult.secure_url,
            public_id: uploadResult.public_id,
          });
        },
      );
      stream.end(buffer);
    });
    return NextResponse.json(
      {
        url: result.secure_url,
        publicId: result.public_id,
        message: "Image uploaded successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image to Cloudinary" },
      { status: 500 },
    );
  }
}
