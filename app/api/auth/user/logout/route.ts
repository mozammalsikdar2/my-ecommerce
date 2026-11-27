import { logoutPortalSession } from "@/lib/auth-portal-api";

export async function POST(request: Request) {
  return logoutPortalSession(request, "user");
}
