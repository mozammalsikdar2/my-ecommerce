import { getPortalCurrentUser } from "@/lib/auth-portal-api";

export async function GET(request: Request) {
  return getPortalCurrentUser(request, "user");
}
