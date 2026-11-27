import { Prisma } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getCookieValue } from "@/lib/auth-cookies";
import { getAccessCookieName, type AuthPortal } from "@/lib/auth-constants";
import { verifyAccessToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

type AuthRole = "CUSTOMER" | "MODERATOR" | "ADMIN";

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const authenticatedUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  role: true,
  isActive: true,
} satisfies Prisma.UserSelect;

function getBearerToken(authorization: string | null) {
  const match = authorization?.trim().match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

export function getAccessTokenFromRequest(
  request: Request,
  portal: AuthPortal = "user",
) {
  const cookieToken = getCookieValue(request, getAccessCookieName(portal));
  return (
    cookieToken || getBearerToken(request.headers.get("authorization"))
  );
}

export async function getAuthenticatedUser(
  request?: Request,
  portal: AuthPortal = "user",
) {
  const token = request
    ? getAccessTokenFromRequest(request, portal)
    : (await cookies()).get(getAccessCookieName(portal))?.value ||
      getBearerToken((await headers()).get("authorization"));
  return getAuthenticatedUserFromToken(token, portal);
}

export async function getAuthenticatedAdmin(request?: Request) {
  return getAuthenticatedUser(request, "admin");
}

export async function getAuthenticatedUserFromToken(
  token: string | null | undefined,
  portal: AuthPortal = "user",
) {
  if (!token) return null;

  const decoded = await verifyAccessToken(token);
  if (!decoded) return null;
  const isStaff = decoded.role === "ADMIN" || decoded.role === "MODERATOR";
  if (portal === "admin" ? !isStaff : decoded.role !== "CUSTOMER") return null;

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: authenticatedUserSelect,
  });

  if (!user?.isActive) return null;
  const userIsStaff = user.role === "ADMIN" || user.role === "MODERATOR";
  return portal === "admin"
    ? userIsStaff
      ? user
      : null
    : user.role === "CUSTOMER"
      ? user
      : null;
}

export async function getSessionUserRecord(portal: AuthPortal = "user") {
  const session = await getCurrentUser(portal);
  if (!session) return null;

  return prisma.user.findUnique({
    where: { id: session.userId },
    select: publicUserSelect,
  });
}

export async function getRequestUserRecord(
  request: Request,
  portal: AuthPortal = "user",
) {
  return getAuthenticatedUserFromToken(
    getAccessTokenFromRequest(request, portal),
    portal,
  );
}

export async function requireRole(
  allowedRoles: readonly AuthRole[],
  request?: Request,
) {
  const portal = allowedRoles.some((role) => role !== "CUSTOMER")
    ? "admin"
    : "user";
  const user =
    portal === "admin"
      ? await getAuthenticatedAdmin(request)
      : await getAuthenticatedUser(request, "user");

  if (!user) {
    return {
      user: null,
      errorResponse: Response.json(
        { error: "Unauthorized: Please log in" },
        { status: 401 },
      ),
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      user: null,
      errorResponse: Response.json(
        { error: "Forbidden: Insufficient permissions" },
        { status: 403 },
      ),
    };
  }

  return { user, errorResponse: null };
}

export async function staffAuthorizationError(
  request: Request,
): Promise<Response | null> {
  const user = await getRequestUserRecord(request, "admin");
  if (!user || !user.isActive) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "MODERATOR") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function requireAdminUser() {
  const user = await getAuthenticatedAdmin();
  if (!user) {
    return {
      user: null,
      response: Response.json({ error: "Authentication required" }, { status: 401 }),
    };
  }
  if (user.role !== "ADMIN") {
    return {
      user: null,
      response: Response.json({ error: "Admin access required" }, { status: 403 }),
    };
  }
  return { user, response: null };
}
