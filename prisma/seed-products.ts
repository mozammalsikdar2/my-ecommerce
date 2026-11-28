import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { seedCatalog } from "./catalog-seed";

loadEnv({ path: [".env.local", ".env"] });

async function main() {
  const unknownArguments = process.argv.slice(2).filter((arg) => arg !== "--force");
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must be set to seed products");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const result = await seedCatalog(prisma, process.argv.includes("--force"));
    console.log(`Completed: ${result.categories} categories, ${result.created} created, ${result.updated} updated.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Product seed error:", error);
  process.exitCode = 1;
});
