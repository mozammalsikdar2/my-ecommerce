import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_ACCESS_COOKIE_NAME,
  USER_ACCESS_COOKIE_NAME,
} from "@/lib/auth-constants";
import { verifyAccessToken } from "@/lib/jwt";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const adminToken = request.cookies.get(ADMIN_ACCESS_COOKIE_NAME)?.value;
  const adminSession = adminToken
    ? await verifyAccessToken(adminToken)
    : null;
  const isStaff =
    adminSession?.role === "ADMIN" || adminSession?.role === "MODERATOR";
  const userToken = request.cookies.get(USER_ACCESS_COOKIE_NAME)?.value;
  const userSession = userToken ? await verifyAccessToken(userToken) : null;
  const isCustomer = userSession?.role === "CUSTOMER";
  const isLoginPage = pathname === "/admin/login";
  const isAdminApi =
    pathname === "/api/admin" || pathname.startsWith("/api/admin/");
  const isAdminPage =
    pathname === "/admin" || pathname.startsWith("/admin/");
  const isAccountPage =
    pathname === "/account" || pathname.startsWith("/account/");

  if (isLoginPage) {
    if (isStaff) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    const response = NextResponse.next();
    if (adminToken && !isStaff) {
      response.cookies.set(ADMIN_ACCESS_COOKIE_NAME, "", {
        httpOnly: true,
        path: "/",
        maxAge: 0,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    return response;
  }

  if (isAdminApi && !isStaff) {
    const response = NextResponse.json(
      { error: adminSession ? "Forbidden" : "Unauthorized" },
      { status: adminSession ? 403 : 401 },
    );
    if (adminToken && !isStaff) {
      response.cookies.set(ADMIN_ACCESS_COOKIE_NAME, "", {
        httpOnly: true,
        path: "/",
        maxAge: 0,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    return response;
  }

  if (isAdminPage && !isStaff) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set(
      "redirect",
      `${pathname}${request.nextUrl.search}`,
    );
    const response = NextResponse.redirect(loginUrl);
    if (adminToken && !isStaff) {
      response.cookies.set(ADMIN_ACCESS_COOKIE_NAME, "", {
        httpOnly: true,
        path: "/",
        maxAge: 0,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    return response;
  }

  if (isAccountPage && !isCustomer) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "redirect",
      `${pathname}${request.nextUrl.search}`,
    );
    const response = NextResponse.redirect(loginUrl);
    if (userToken && !isCustomer) {
      response.cookies.set(USER_ACCESS_COOKIE_NAME, "", {
        httpOnly: true,
        path: "/",
        maxAge: 0,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    return response;
  }

  const isUserManagementRoute =
    pathname === "/admin/users" ||
    pathname.startsWith("/admin/users/") ||
    pathname === "/api/admin/users" ||
    pathname.startsWith("/api/admin/users/");

  if (isUserManagementRoute && adminSession?.role !== "ADMIN") {
    if (isAdminApi) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/account",
    "/admin/:path*",
    "/api/admin/:path*",
    "/account/:path*",
  ],
};
