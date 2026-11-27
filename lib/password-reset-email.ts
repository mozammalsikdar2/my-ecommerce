import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  customerName: string;
  otp: string;
}) {
  const host = process.env.SMTP_HOST?.trim();
  const username = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT || 587);

  if (!host || !username || !password) {
    throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port");
  }
  if (
    !params.to.trim() ||
    params.to.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.to.trim())
  ) {
    throw new Error("A valid recipient email address is required");
  }
  if (!/^\d{6}$/.test(params.otp)) {
    throw new Error("Password reset code must contain exactly six digits");
  }

  const siteSettings = await prisma.siteSettings.findUnique({
    where: { id: 1 },
    select: { storeName: true, primaryColor: true },
  });
  const rawStoreName = siteSettings?.storeName.trim() || "ALIF STORE";
  const storeName = rawStoreName.replace(/[\r\n]+/g, " ").slice(0, 120);
  const safeStoreName = escapeHtml(storeName);
  const primaryColor =
    siteSettings?.primaryColor && /^#[\da-f]{6}$/i.test(siteSettings.primaryColor)
      ? siteSettings.primaryColor
      : "#0f766e";
  const customerName = escapeHtml(params.customerName.trim().slice(0, 120));
  const from =
    process.env.SMTP_FROM?.trim() || `"${storeName}" <${username}>`;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: username, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  await transporter.sendMail({
    from,
    to: params.to.trim(),
    subject: `${params.otp} is your ${storeName} password reset code`,
    text: [
      `Hello ${params.customerName.trim()},`,
      "",
      `Your ${storeName} password reset code is ${params.otp}.`,
      "This code expires in 10 minutes.",
      "",
      "If you did not request a password reset, you can safely ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
        <h2 style="margin:0 0 12px;color:${primaryColor};">${safeStoreName}</h2>
        <p style="font-size:14px;color:#374151;">Hello <strong>${customerName}</strong>,</p>
        <p style="font-size:14px;color:#374151;">Use the verification code below to reset your account password. This code expires in <strong>10 minutes</strong>.</p>
        <div style="margin:20px 0;padding:16px;background:#f3f4f6;border-radius:10px;text-align:center;font-size:28px;font-weight:800;letter-spacing:6px;color:#111827;">
          ${params.otp}
        </div>
        <p style="font-size:12px;color:#6b7280;">If you did not request a password reset, you can safely ignore this email.</p>
      </div>
    `,
  });

  return { sent: true };
}
