import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";

export interface InvoiceOrderData {
  orderNumber: string;
  createdAt: Date | string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  deliveryAddress: string;
  deliveryZone: string;
  subtotal: number;
  discountAmount: number;
  couponCode?: string | null;
  deliveryCharge: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  items: {
    quantity: number;
    price: number;
    variantInfo?: string | null;
    product: { name: string };
  }[];
}

export interface InvoiceStoreInfo {
  storeName: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
}

function sanitizeAscii(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, "").trim();
}

function drawTableHeader(
  page: PDFPage,
  y: number,
  width: number,
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  dark: ReturnType<typeof rgb>,
) {
  page.drawRectangle({
    x: 45,
    y: y - 6,
    width: width - 90,
    height: 22,
    color: rgb(0.95, 0.96, 0.97),
  });
  page.drawText("ITEM DESCRIPTION", {
    x: 52,
    y,
    size: 9,
    font: fontBold,
    color: dark,
  });
  page.drawText("QTY", {
    x: 350,
    y,
    size: 9,
    font: fontBold,
    color: dark,
  });
  page.drawText("UNIT PRICE", {
    x: 405,
    y,
    size: 9,
    font: fontBold,
    color: dark,
  });
  page.drawText("TOTAL", {
    x: 495,
    y,
    size: 9,
    font: fontBold,
    color: dark,
  });
}

export async function generateInvoicePdfBuffer(
  order: InvoiceOrderData,
  store: InvoiceStoreInfo,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdfDoc.addPage(pageSize);
  const { width, height } = page.getSize();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const dark = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.42, 0.45, 0.5);
  const accent = rgb(0.06, 0.46, 0.43);
  const lineGray = rgb(0.88, 0.9, 0.92);

  let y = height - 50;

  page.drawText(sanitizeAscii(store.storeName || "ALIF STORE").toUpperCase(), {
    x: 45,
    y,
    size: 20,
    font: fontBold,
    color: accent,
  });
  page.drawText("INVOICE / RECEIPT", {
    x: width - 195,
    y,
    size: 16,
    font: fontBold,
    color: dark,
  });

  y -= 18;
  page.drawText(
    sanitizeAscii(`${store.contactAddress} | ${store.contactPhone}`),
    { x: 45, y, size: 9.5, font: fontRegular, color: muted },
  );
  page.drawText(`Order #: ${sanitizeAscii(order.orderNumber)}`, {
    x: width - 195,
    y,
    size: 10,
    font: fontBold,
    color: dark,
  });

  y -= 14;
  page.drawText(sanitizeAscii(store.contactEmail), {
    x: 45,
    y,
    size: 9.5,
    font: fontRegular,
    color: muted,
  });
  const parsedDate = new Date(order.createdAt);
  const formattedDate = Number.isNaN(parsedDate.getTime())
    ? "Unknown"
    : parsedDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
  page.drawText(`Date: ${formattedDate}`, {
    x: width - 195,
    y,
    size: 9.5,
    font: fontRegular,
    color: muted,
  });

  y -= 22;
  page.drawLine({
    start: { x: 45, y },
    end: { x: width - 45, y },
    thickness: 1,
    color: lineGray,
  });

  y -= 24;
  page.drawText("BILL TO & DELIVERY ADDRESS:", {
    x: 45,
    y,
    size: 9,
    font: fontBold,
    color: muted,
  });
  page.drawText("PAYMENT & ORDER STATUS:", {
    x: width - 220,
    y,
    size: 9,
    font: fontBold,
    color: muted,
  });

  y -= 16;
  page.drawText(sanitizeAscii(order.customerName), {
    x: 45,
    y,
    size: 11,
    font: fontBold,
    color: dark,
  });
  page.drawText(
    `Method: ${sanitizeAscii(order.paymentMethod)} (${sanitizeAscii(order.paymentStatus)})`,
    {
      x: width - 220,
      y,
      size: 10,
      font: fontBold,
      color: dark,
    },
  );

  y -= 15;
  page.drawText(`Phone: ${sanitizeAscii(order.customerPhone)}`, {
    x: 45,
    y,
    size: 10,
    font: fontRegular,
    color: dark,
  });
  page.drawText(`Status: ${sanitizeAscii(order.orderStatus)}`, {
    x: width - 220,
    y,
    size: 10,
    font: fontRegular,
    color: dark,
  });

  y -= 15;
  const zoneLabel =
    order.deliveryZone === "INSIDE_DHAKA" ? "Inside Dhaka" : "Outside Dhaka";
  const cleanAddress = sanitizeAscii(order.deliveryAddress).slice(0, 72);
  page.drawText(`${cleanAddress} (${zoneLabel})`, {
    x: 45,
    y,
    size: 9.5,
    font: fontRegular,
    color: muted,
  });

  y -= 32;
  drawTableHeader(page, y, width, fontBold, dark);
  y -= 24;

  for (const item of order.items) {
    if (y < 170) {
      page = pdfDoc.addPage(pageSize);
      y = height - 60;
      drawTableHeader(page, y, width, fontBold, dark);
      y -= 24;
    }

    const label = sanitizeAscii(
      `${item.product.name}${item.variantInfo ? ` (${item.variantInfo})` : ""}`,
    ).slice(0, 52);
    const lineTotal = item.price * item.quantity;

    page.drawText(label, {
      x: 52,
      y,
      size: 10,
      font: fontRegular,
      color: dark,
    });
    page.drawText(String(item.quantity), {
      x: 355,
      y,
      size: 10,
      font: fontRegular,
      color: dark,
    });
    page.drawText(`BDT ${item.price.toLocaleString()}`, {
      x: 405,
      y,
      size: 10,
      font: fontRegular,
      color: dark,
    });
    page.drawText(`BDT ${lineTotal.toLocaleString()}`, {
      x: 490,
      y,
      size: 10,
      font: fontBold,
      color: dark,
    });

    y -= 10;
    page.drawLine({
      start: { x: 45, y },
      end: { x: width - 45, y },
      thickness: 0.5,
      color: lineGray,
    });
    y -= 16;
  }

  y -= 10;
  const totalsXLabel = 385;
  const totalsXValue = 485;
  page.drawText("Subtotal:", {
    x: totalsXLabel,
    y,
    size: 10,
    font: fontRegular,
    color: muted,
  });
  page.drawText(`BDT ${order.subtotal.toLocaleString()}`, {
    x: totalsXValue,
    y,
    size: 10,
    font: fontBold,
    color: dark,
  });

  if (order.discountAmount > 0) {
    y -= 16;
    page.drawText(
      `Discount${order.couponCode ? ` (${sanitizeAscii(order.couponCode)})` : ""}:`,
      {
        x: totalsXLabel,
        y,
        size: 10,
        font: fontRegular,
        color: accent,
      },
    );
    page.drawText(`-BDT ${order.discountAmount.toLocaleString()}`, {
      x: totalsXValue,
      y,
      size: 10,
      font: fontBold,
      color: accent,
    });
  }

  y -= 16;
  page.drawText("Delivery Charge:", {
    x: totalsXLabel,
    y,
    size: 10,
    font: fontRegular,
    color: muted,
  });
  page.drawText(`BDT ${order.deliveryCharge.toLocaleString()}`, {
    x: totalsXValue,
    y,
    size: 10,
    font: fontBold,
    color: dark,
  });

  y -= 22;
  page.drawLine({
    start: { x: totalsXLabel, y: y + 12 },
    end: { x: width - 45, y: y + 12 },
    thickness: 1,
    color: dark,
  });
  page.drawText("GRAND TOTAL:", {
    x: totalsXLabel,
    y,
    size: 11,
    font: fontBold,
    color: dark,
  });
  page.drawText(`BDT ${order.totalAmount.toLocaleString()}`, {
    x: totalsXValue,
    y,
    size: 12,
    font: fontBold,
    color: accent,
  });

  page.drawText(
    sanitizeAscii(
      `Thank you for shopping with ${store.storeName}! For support, call ${store.contactPhone}.`,
    ),
    {
      x: 45,
      y: 45,
      size: 9,
      font: fontRegular,
      color: muted,
    },
  );

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
