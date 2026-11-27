"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import StoreFooter from "@/components/StoreFooter";
import FloatingChatButtons from "@/components/FloatingChatButtons";
import { AuthProvider } from "@/context/AuthContext";

export default function StorefrontShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdminRoute =
    pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminRoute) {
    return <AuthProvider portal="admin">{children}</AuthProvider>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <FloatingChatButtons />
      <StoreFooter />
    </>
  );
}
