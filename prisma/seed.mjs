import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: [".env.local", ".env"] });

const required = [
  "SUPER_ADMIN_NAME",
  "SUPER_ADMIN_EMAIL",
  "SUPER_ADMIN_PASSWORD",
];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const name = process.env.SUPER_ADMIN_NAME.trim();
const email = process.env.SUPER_ADMIN_EMAIL.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;
const rawPhone = process.env.SUPER_ADMIN_PHONE?.trim() || "";

function normalizeBdPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const match = digits.match(/^(?:88)?(01[3-9]\d{8})$/);
  return match ? match[1] : null;
}

const phone = normalizeBdPhone(rawPhone);

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("SUPER_ADMIN_EMAIL must be a valid email address");
}
if (rawPhone && !phone) {
  throw new Error(
    "SUPER_ADMIN_PHONE must be a valid Bangladesh mobile number",
  );
}
if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
  throw new Error(
    "SUPER_ADMIN_PASSWORD must be at least 12 characters and no more than 72 UTF-8 bytes",
  );
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be set to seed the super-admin account");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

try {
  const hashedPassword = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: {
      name,
      ...(phone ? { phone } : {}),
      password: hashedPassword,
      role: "ADMIN",
      isActive: true,
    },
    create: {
      name,
      email,
      phone,
      password: hashedPassword,
      role: "ADMIN",
      isActive: true,
      twoFactorEnabled: true,
      twoFactorChannel: "EMAIL",
    },
  });

  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  console.info("Super-admin account seeded successfully.");
} finally {
  await prisma.$disconnect();
}
