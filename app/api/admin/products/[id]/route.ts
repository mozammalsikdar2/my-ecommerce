import { PUT as updateProduct } from "@/app/api/products/[id]/route";
import { normalizeAdminProductInput } from "@/lib/admin-product-input";
import { isRecord, readJsonBody } from "@/lib/api-utils";
import { deleteProduct } from "@/lib/product-delete";
import { staffAuthorizationError } from "@/lib/user-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }
  return updateProduct(new Request(request.url, {
    method: "PUT",
    headers: request.headers,
    body: JSON.stringify(normalizeAdminProductInput(body)),
  }), context);
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const authError = await staffAuthorizationError(request);
  if (authError) return authError;

  const { id } = await params;
  const response = await deleteProduct(id);
  return response.ok ? Response.json({ deleted: true }) : response;
}
