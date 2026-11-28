import { POST as createProduct } from "@/app/api/products/route";
import { normalizeAdminProductInput } from "@/lib/admin-product-input";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { listProducts } from "@/lib/product-list";
import { staffAuthorizationError } from "@/lib/user-auth";

export async function GET(request: Request) {
  return listProducts(request, true);
}

export async function POST(request: Request) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const normalized = {
    ...normalizeAdminProductInput(body),
    ...(body.stock == null ? { stock: 20 } : {}),
  };

  return createProduct(new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(normalized),
  }));
}
