import { prisma } from "@/lib/prisma";

const defaultPages = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    content: `<h2>1. Information We Collect</h2>
<p>We collect personal information that you provide directly to us when placing an order or creating an account, including your name, phone number, email address, and delivery address.</p>
<h2>2. How We Use Your Information</h2>
<ul>
  <li>To process, confirm, and deliver your orders accurately.</li>
  <li>To send order tracking updates via SMS or email.</li>
  <li>To improve our products, customer service, and website experience.</li>
</ul>
<h2>3. Data Security</h2>
<p>We never sell or rent your personal details to third parties. Information is shared strictly with verified delivery partners (such as Steadfast or Pathao) solely to complete your delivery.</p>`,
  },
  {
    slug: "terms-and-conditions",
    title: "Terms & Conditions",
    content: `<h2>1. General Terms</h2>
<p>By accessing and placing an order on our website, you agree to comply with the terms and conditions outlined below.</p>
<h2>2. Product Pricing & Availability</h2>
<p>All prices are listed in Bangladeshi Taka (BDT). We reserve the right to update product prices, discounts, and stock availability without prior notice.</p>
<h2>3. Order Confirmation & Cancellation</h2>
<p>Orders are confirmed via phone or SMS. We reserve the right to cancel any order in the event of stock unavailability or incorrect pricing information.</p>`,
  },
  {
    slug: "return-refund-policy",
    title: "Return & Refund Policy",
    content: `<h2>1. Easy 7-Day Return Policy</h2>
<p>If you receive a damaged, defective, or incorrect product, you may request a replacement or return within <strong>7 days</strong> of delivery.</p>
<h2>2. Conditions for Return</h2>
<ul>
  <li>The item must be unused, unworn, and in its original packaging with tags/seals intact.</li>
  <li>Please check the parcel in front of the delivery rider whenever possible.</li>
</ul>
<h2>3. Refund Process</h2>
<p>Once the returned item is inspected at our warehouse, refunds are processed within <strong>3 to 5 business days</strong> via bKash, Nagad, or bank transfer.</p>`,
  },
  {
    slug: "about-contact",
    title: "About Us & Contact Us",
    content: `<h2>Who We Are</h2>
<p>Welcome to our store! We are committed to delivering 100% authentic, quality-checked products directly to your doorstep across Bangladesh with fast shipping and dedicated customer support.</p>
<h2>Why Shop With Us?</h2>
<ul>
  <li><strong>100% Genuine Products:</strong> Every item is carefully inspected before dispatch.</li>
  <li><strong>Nationwide Cash on Delivery:</strong> Fast delivery inside Dhaka and across all districts.</li>
  <li><strong>Responsive Support:</strong> Reach our team anytime via phone, WhatsApp, or email.</li>
</ul>`,
  },
] as const;

export async function ensureDefaultPages() {
  await prisma.$transaction(
    defaultPages.map(({ slug, ...page }) =>
      prisma.page.upsert({
        where: { slug },
        update: {},
        create: { ...page, slug, isPublished: false },
      }),
    ),
  );
}
