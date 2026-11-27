import { handlePortalLogin } from "@/lib/auth-login";

export async function POST(request: Request) {
  return handlePortalLogin(request, "admin");
}
