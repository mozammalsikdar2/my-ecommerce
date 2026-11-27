import { refreshPortalSession } from "@/lib/auth-portal-api";

export async function POST(request: Request) {
  return refreshPortalSession(request, "user");
}
