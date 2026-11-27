import nodemailer from "nodemailer";
import { Resend } from "resend";
import { z } from "zod";
import { generateInvoicePdfBuffer } from "@/lib/invoice";
import type { InvoiceOrderData } from "@/lib/invoice";
import { decryptPaymentSecret } from "@/lib/payment-secrets";
import { prisma } from "@/lib/prisma";

const statusHeadlines: Record<string, { title: string; message: string }> = {
  PENDING: {
    title: "Order Received & Pending Review",
    message:
      "We have received your order and our team is verifying your items for dispatch.",
  },
  CONFIRMED: {
    title: "Your Order is Confirmed!",
    message:
      "Great news! Your order has been confirmed and is currently being packed at our warehouse.",
  },
  SHIPPED: {
    title: "Your Parcel is Out for Delivery!",
    message:
      "Your order has been handed over to our delivery partner and is on its way to your address.",
  },
  DELIVERED: {
    title: "Order Delivered — Thank You!",
    message:
      "Your package has been delivered. We hope you enjoy your purchase!",
  },
  CANCELLED: {
    title: "Order Cancelled",
    message:
      "Your order has been cancelled. If you have any questions, please contact our support team.",
  },
};

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

function getSafeColor(value: string | undefined) {
  return value && /^#[\da-f]{6}$/i.test(value) ? value : "#0f766e";
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n]/g, " ").trim();
}

function getSafeAppUrl() {
  const appUrl = new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  );
  if (
    (appUrl.protocol !== "http:" && appUrl.protocol !== "https:") ||
    appUrl.username ||
    appUrl.password
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid HTTP(S) URL");
  }
  return appUrl;
}

function getStatusInfo(status: string) {
  return (
    statusHeadlines[status] ?? {
      title: `Order Status Updated: ${status}`,
      message: `Your order status is now ${status}.`,
    }
  );
}

function createEmailHtml({
  order,
  storeName,
  primaryColor,
  contactAddress,
  contactPhone,
  trackUrl,
  statusInfo,
  invoiceAttached,
}: {
  order: InvoiceOrderData & {
    courierProvider?: string | null;
    trackingCode?: string | null;
  };
  storeName: string;
  primaryColor: string;
  contactAddress: string;
  contactPhone: string;
  trackUrl: string;
  statusInfo: { title: string; message: string };
  invoiceAttached: boolean;
}) {
  const itemsHtml = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-size:13px;">
            <strong>${escapeHtml(item.product.name)}</strong>${
              item.variantInfo
                ? ` <span style="color:#6b7280;">(${escapeHtml(item.variantInfo)})</span>`
                : ""
            }
          </td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;">
            ${item.quantity}
          </td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;font-weight:700;">
            BDT ${(item.price * item.quantity).toLocaleString()}
          </td>
        </tr>`,
    )
    .join("");

  const trackingDetails = order.trackingCode
    ? `<div style="margin-bottom:16px;padding:12px 16px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;font-size:13px;color:#115e59;">
        <strong>Courier Partner:</strong> ${escapeHtml(order.courierProvider || "Courier")} &nbsp;|&nbsp;
        <strong>Tracking Code:</strong> <span style="font-family:monospace;font-weight:800;">${escapeHtml(order.trackingCode)}</span>
      </div>`
    : "";
  const discountLine =
    order.discountAmount > 0
      ? `<div style="color:#059669;">Discount${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ""}: <strong>-BDT ${order.discountAmount.toLocaleString()}</strong></div>`
      : "";
  const invoiceNote = invoiceAttached
    ? `<p style="margin-top:20px;font-size:12px;color:#6b7280;text-align:center;">
        Your official PDF invoice (<strong>Invoice-${escapeHtml(order.orderNumber)}.pdf</strong>) is attached to this email.
      </p>`
    : "";

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#ffffff;">
      <div style="background:${primaryColor};padding:22px 24px;color:#ffffff;">
        <h1 style="margin:0;font-size:20px;">${escapeHtml(storeName)}</h1>
        <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">Order #${escapeHtml(order.orderNumber)}</p>
      </div>
      <div style="padding:24px;">
        <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">${escapeHtml(statusInfo.title)}</h2>
        <p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.5;">
          Hello <strong>${escapeHtml(order.customerName)}</strong>, ${escapeHtml(statusInfo.message)}
        </p>
        ${trackingDetails}
        <table style="width:100%;border-collapse:collapse;margin-top:12px;">
          <thead>
            <tr style="background:#f9fafb;text-align:left;font-size:12px;color:#6b7280;">
              <th style="padding:10px;">Item</th>
              <th style="padding:10px;text-align:center;">Qty</th>
              <th style="padding:10px;text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div style="margin-top:16px;padding-top:12px;border-top:2px solid #f3f4f6;text-align:right;font-size:13px;color:#374151;">
          <div>Subtotal: <strong>BDT ${order.subtotal.toLocaleString()}</strong></div>
          ${discountLine}
          <div>Delivery Fee: <strong>BDT ${order.deliveryCharge.toLocaleString()}</strong></div>
          <div style="margin-top:6px;font-size:16px;color:#111827;">
            Grand Total: <strong style="color:${primaryColor};">BDT ${order.totalAmount.toLocaleString()}</strong>
            <span style="font-size:12px;color:#6b7280;">(${escapeHtml(order.paymentMethod)} - ${escapeHtml(order.paymentStatus)})</span>
          </div>
        </div>
        <div style="margin-top:24px;text-align:center;">
          <a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:${primaryColor};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;">
            Track Live Order Status
          </a>
        </div>
        ${invoiceNote}
      </div>
      <div style="background:#f9fafb;padding:14px 24px;text-align:center;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">
        ${escapeHtml(contactAddress)}${contactPhone ? ` • ${escapeHtml(contactPhone)}` : ""}
      </div>
    </div>`;
}

export async function sendOrderEmail(params: {
  order: InvoiceOrderData & {
    courierProvider?: string | null;
    trackingCode?: string | null;
  };
  type: "CONFIRMATION" | "STATUS_UPDATE";
  test?: boolean;
}) {
  const { order, type, test = false } = params;

  if (!order.customerEmail) {
    return { sent: false, reason: "Customer did not provide an email address" };
  }
  if (!z.string().email().safeParse(order.customerEmail).success) {
    return { sent: false, reason: "Customer email address is invalid" };
  }

  try {
    const [emailConfig, siteSettings] = await Promise.all([
      prisma.emailSettings.findUnique({ where: { id: 1 } }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);

    if (!emailConfig) {
      return { sent: false, reason: "Email settings are not configured" };
    }
    if (!test && !emailConfig.emailEnabled) {
      return { sent: false, reason: "Email notifications are disabled" };
    }
    if (!test && type === "CONFIRMATION" && !emailConfig.sendOnOrderCreate) {
      return { sent: false, reason: "Order confirmation emails disabled" };
    }
    if (!test && type === "STATUS_UPDATE" && !emailConfig.sendOnStatusUpdate) {
      return { sent: false, reason: "Order status update emails disabled" };
    }
    if (
      !z.string().email().safeParse(emailConfig.senderEmail).success ||
      !emailConfig.senderName.trim()
    ) {
      return { sent: false, reason: "Sender identity is incomplete" };
    }
    if (emailConfig.provider !== "SMTP" && emailConfig.provider !== "RESEND") {
      return { sent: false, reason: "Unsupported email provider" };
    }

    const smtpUser = decryptPaymentSecret(emailConfig.smtpUser);
    const smtpPass = decryptPaymentSecret(emailConfig.smtpPass);
    const resendApiKey = decryptPaymentSecret(emailConfig.resendApiKey);
    const storeName = sanitizeHeaderValue(emailConfig.senderName);
    const primaryColor = getSafeColor(siteSettings?.primaryColor);
    const appUrl = getSafeAppUrl();
    const trackUrl = new URL("/track-order", appUrl);
    trackUrl.searchParams.set("order", order.orderNumber);
    const statusInfo = getStatusInfo(order.orderStatus);
    const subject =
      type === "CONFIRMATION"
        ? `Order Confirmed (${sanitizeHeaderValue(order.orderNumber)}) & Invoice — ${storeName}`
        : `${sanitizeHeaderValue(statusInfo.title)} (${sanitizeHeaderValue(order.orderNumber)}) — ${storeName}`;

    let pdfBuffer: Buffer | undefined;
    if (emailConfig.attachPdfInvoice) {
      pdfBuffer = await generateInvoicePdfBuffer(order, {
        storeName,
        contactPhone: siteSettings?.contactPhone || "",
        contactEmail: siteSettings?.contactEmail || emailConfig.senderEmail,
        contactAddress: siteSettings?.contactAddress || "Dhaka, Bangladesh",
      });
    }

    const html = createEmailHtml({
      order,
      storeName,
      primaryColor,
      contactAddress: siteSettings?.contactAddress || "Dhaka, Bangladesh",
      contactPhone: siteSettings?.contactPhone || "",
      trackUrl: trackUrl.toString(),
      statusInfo,
      invoiceAttached: Boolean(pdfBuffer),
    });
    const filename = `Invoice-${order.orderNumber}.pdf`;
    const attachments = pdfBuffer
      ? [{ filename, content: pdfBuffer, contentType: "application/pdf" }]
      : [];

    if (emailConfig.provider === "RESEND") {
      if (!resendApiKey) {
        return { sent: false, reason: "Resend API key is missing" };
      }

      const resend = new Resend(resendApiKey);
      const { error } = await resend.emails.send({
        from: `"${storeName.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${emailConfig.senderEmail}>`,
        to: [order.customerEmail],
        subject,
        html,
        ...(pdfBuffer
          ? {
              attachments: [
                { filename, content: pdfBuffer, contentType: "application/pdf" },
              ],
            }
          : {}),
      });

      if (error) {
        console.error("Resend email error:", error);
        return { sent: false, reason: error.message };
      }
      return { sent: true, provider: "RESEND" };
    }

    if (!emailConfig.smtpHost || !smtpUser || !smtpPass) {
      return { sent: false, reason: "SMTP credentials are incomplete" };
    }

    const transporter = nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort || 587,
      secure: emailConfig.smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    await transporter.sendMail({
      from: { name: storeName, address: emailConfig.senderEmail },
      to: order.customerEmail,
      subject,
      html,
      attachments,
    });

    return { sent: true, provider: "SMTP" };
  } catch (error) {
    console.error("sendOrderEmail exception:", error);
    return { sent: false, reason: "Failed to send order email" };
  }
}
