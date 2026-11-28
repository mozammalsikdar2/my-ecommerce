import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

interface ProductTemplate {
  name: string;
  price: number;
  discountPrice?: number;
  stock: number;
  description: string;
  image: string;
}

const CATEGORY_TEMPLATES: Record<string, ProductTemplate[]> = {
  perfume: [
    { name: "Royal Arabian Oud Extrait 12ml", price: 1450, discountPrice: 1250, stock: 40, description: "Deep aged agarwood and warm amber concentrated attar oil, alcohol-free.", image: "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=800&q=80" },
    { name: "White Musk Tahara Silk 6ml", price: 650, discountPrice: 550, stock: 60, description: "Clean, powdery white musk with soft floral undertones for daily wear.", image: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=80" },
    { name: "Sultan Saffron & Amber 12ml", price: 1600, discountPrice: 1390, stock: 30, description: "Rich Kashmiri saffron blended with golden resinous amber.", image: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&q=80" },
    { name: "Damask Rose Sovereign Attar 6ml", price: 950, discountPrice: 820, stock: 35, description: "Pure steam-distilled Taif and Damask rose petals in sandalwood base.", image: "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=800&q=80" },
    { name: "Midnight Leather & Bergamot EDP 50ml", price: 2400, discountPrice: 1990, stock: 25, description: "Crisp Calabrian bergamot layered over smoky leather and cedarwood.", image: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=800&q=80" },
    { name: "Kasturi Black Deer Musk 6ml", price: 1200, discountPrice: 1050, stock: 28, description: "Traditional bold dark musk with warm spicy dry-down.", image: "https://images.unsplash.com/photo-1615634260167-c8cdede054de?w=800&q=80" },
    { name: "Mysore Sandalwood Reserve 12ml", price: 1350, stock: 22, description: "Creamy, meditative sandalwood oil with long-lasting skin projection.", image: "https://images.unsplash.com/photo-1595425970377-c9703cf48b6d?w=800&q=80" },
    { name: "Blue Ocean Citrus Eau De Parfum 100ml", price: 2200, discountPrice: 1850, stock: 45, description: "Fresh aquatic sea salt, grapefruit zest, and Iso E Super.", image: "https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=800&q=80" },
    { name: "Amir Al Oud Intense 12ml", price: 1100, discountPrice: 950, stock: 50, description: "Sweet caramelized wood, vanilla bean, and smoky agarwood.", image: "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=800&q=80" },
    { name: "Jannatul Firdaus Classic Attar 12ml", price: 580, discountPrice: 490, stock: 75, description: "Iconic herbal-floral classic oriental fragrance oil.", image: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=80" },
    { name: "Golden Vanilla & Tonka Bean 50ml", price: 2100, discountPrice: 1790, stock: 30, description: "Warm Madagascar vanilla absolute paired with roasted tonka.", image: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&q=80" },
    { name: "Velvet Jasmine Sambac 6ml", price: 890, stock: 32, description: "Night-blooming Arabian jasmine with a soft clean musk trail.", image: "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=800&q=80" },
    { name: "Imperial Oud & Patchouli 12ml", price: 1550, discountPrice: 1320, stock: 26, description: "Earthy aged patchouli leaves infused with dark Cambodian oud.", image: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=800&q=80" },
    { name: "Silver Mountain Spring EDP 100ml", price: 2650, discountPrice: 2290, stock: 20, description: "Crisp green tea, blackcurrant, and cool alpine musk.", image: "https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=800&q=80" },
    { name: "Bakhoor Mukhallat Royal 12ml", price: 1250, discountPrice: 1090, stock: 38, description: "Festive Arabian incense blend of rose, frankincense, and oud.", image: "https://images.unsplash.com/photo-1615634260167-c8cdede054de?w=800&q=80" },
    { name: "Aventus Inspired King EDP 50ml", price: 2500, discountPrice: 2150, stock: 42, description: "Smoky pineapple, birch wood, and oakmoss projection.", image: "https://images.unsplash.com/photo-1595425970377-c9703cf48b6d?w=800&q=80" },
    { name: "Sabaya Fresh Citrus Floral 6ml", price: 520, discountPrice: 450, stock: 80, description: "Bright, uplifting citrus and rose bouquet for everyday freshness.", image: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=80" },
    { name: "Ambergris & Sea Breeze 12ml", price: 1400, stock: 24, description: "Mineral marine ambergris with clean woody longevity.", image: "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=800&q=80" },
    { name: "Spiced Cardamom & Cedar 50ml", price: 2300, discountPrice: 1950, stock: 27, description: "Aromatic green cardamom pods over dry Atlas cedar.", image: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=800&q=80" },
    { name: "Mukhallat Shams Gold 12ml", price: 1150, discountPrice: 980, stock: 34, description: "Radiant floral-woody signature attar for Jummah and Eid.", image: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&q=80" },
    { name: "White Oud & Iris Velvet 50ml", price: 2450, discountPrice: 2100, stock: 22, description: "Smooth powdery iris butter balanced with light white agarwood.", image: "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=800&q=80" },
    { name: "Kesar Chandan Heritage 6ml", price: 780, discountPrice: 680, stock: 45, description: "Traditional saffron and sandalwood oil crafted for long wear.", image: "https://images.unsplash.com/photo-1595425970377-c9703cf48b6d?w=800&q=80" },
    { name: "Noir Extreme Oud Spray 100ml", price: 2800, discountPrice: 2390, stock: 18, description: "Evening statement fragrance with nutmeg, oud, and amber.", image: "https://images.unsplash.com/photo-1615634260167-c8cdede054de?w=800&q=80" },
    { name: "Sultan Al Lail Night Musk 12ml", price: 990, discountPrice: 850, stock: 48, description: "Smooth dark berry, lavender, and sensual musk oil.", image: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=80" },
    { name: "Baccarat Rouge Style Crystal 50ml", price: 2600, discountPrice: 2200, stock: 35, description: "Airy saffron, ambroxan, and fir resin crystalline aura.", image: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&q=80" },
    { name: "Sheikh Al Shuyukh Reserve 12ml", price: 1300, discountPrice: 1120, stock: 30, description: "Noble blend of aged oud, rosewood, and sweet resin.", image: "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=800&q=80" },
    { name: "Fresh Vetiver & Lime 50ml", price: 1950, discountPrice: 1690, stock: 33, description: "Crisp Haitian vetiver grass with zesty green lime.", image: "https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=800&q=80" },
    { name: "5-Piece Luxury Attar Gift Box (5x6ml)", price: 2950, discountPrice: 2490, stock: 25, description: "Curated gift box featuring Oud, White Musk, Rose, Amber & Saffron.", image: "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=800&q=80" },
    { name: "Oud Ispahan Rose Smoke 12ml", price: 1500, discountPrice: 1290, stock: 29, description: "Velvety rose petals wrapped in smoky labdanum and oud.", image: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=800&q=80" },
    { name: "Alif Signature Gold Edition 15ml", price: 1850, discountPrice: 1590, stock: 40, description: "House flagship blend of Cambodian oud, saffron, and golden musk.", image: "https://images.unsplash.com/photo-1615634260167-c8cdede054de?w=800&q=80" },
  ],

  gadget: [
    { name: "AMOLED Smart Watch Ultra Call Series", price: 3450, discountPrice: 2890, stock: 35, description: "1.96-inch Always-On AMOLED display, Bluetooth calling, 100+ sports modes.", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80" },
    { name: "ANC Wireless Earbuds Pro Gen 2", price: 2450, discountPrice: 1990, stock: 50, description: "Active Noise Cancellation, 30-hour battery case, deep bass drivers.", image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&q=80" },
    { name: "65W GaN Fast Wall Charger (3-Port)", price: 2150, discountPrice: 1850, stock: 45, description: "Dual USB-C PD + USB-A fast charger for laptops and smartphones.", image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&q=80" },
    { name: "20000mAh 22.5W Fast Power Bank", price: 2250, discountPrice: 1950, stock: 40, description: "Digital LED percentage display with dual-way PD fast charging.", image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&q=80" },
    { name: "RGB Mechanical Gaming Keyboard (Blue Switch)", price: 3200, discountPrice: 2750, stock: 25, description: "Tactile mechanical switches, 18 RGB lighting modes, detachable Type-C.", image: "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=800&q=80" },
    { name: "Ergonomic Wireless Silent Mouse", price: 1150, discountPrice: 950, stock: 60, description: "Dual-mode Bluetooth 5.2 + 2.4GHz USB receiver with rechargeable battery.", image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&q=80" },
    { name: "Portable Bluetooth Waterproof Speaker", price: 2650, discountPrice: 2290, stock: 30, description: "IPX7 waterproof outdoor speaker with 360-degree stereo sound.", image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80" },
    { name: "Magnetic Wireless MagSafe Power Bank 10000mAh", price: 2850, discountPrice: 2450, stock: 28, description: "Snap-on 15W wireless charging with foldable kickstand.", image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&q=80" },
    { name: "7-in-1 USB-C Multiport Aluminum Hub", price: 2400, discountPrice: 1990, stock: 32, description: "4K HDMI, 100W PD pass-through, SD/TF card reader, and 3x USB 3.0.", image: "https://images.unsplash.com/photo-1625842268584-8f3296236761?w=800&q=80" },
    { name: "Foldable Aluminum Laptop Cooling Stand", price: 1350, discountPrice: 1090, stock: 55, description: "6-level height adjustment for MacBook and Windows laptops up to 17-inch.", image: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&q=80" },
    { name: "Dual Wireless Lavalier Collar Microphone", price: 1850, discountPrice: 1490, stock: 42, description: "Plug-and-play noise reduction mic for YouTube, Reels, and vlogging.", image: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&q=80" },
    { name: "1080p Full HD Autofocus Webcam with Cover", price: 2350, discountPrice: 1990, stock: 26, description: "Built-in dual stereo microphones and privacy shutter for Zoom/Meet.", image: "https://images.unsplash.com/photo-1587826080692-f439cd0b70da?w=800&q=80" },
    { name: "Smart Wi-Fi 1080p Home Security Camera", price: 2550, discountPrice: 2150, stock: 34, description: "360-degree pan/tilt, night vision, two-way audio, and mobile alerts.", image: "https://images.unsplash.com/photo-1557324232-b8917d3c3dcb?w=800&q=80" },
    { name: "100W Braided Digital Watt-Display Type-C Cable", price: 650, discountPrice: 520, stock: 90, description: "Real-time LED wattage readout with reinforced nylon braiding.", image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&q=80" },
    { name: "Over-Ear Studio Wireless Headphones", price: 3600, discountPrice: 3150, stock: 22, description: "40mm drivers, memory foam earcups, 45-hour battery life.", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80" },
    { name: "Mini UPS Router Backup 10400mAh (9V/12V)", price: 2490, discountPrice: 2190, stock: 48, description: "Keeps Wi-Fi router and ONU online for up to 5 hours during power cuts.", image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&q=80" },
    { name: "10-inch Desktop Ring Light with Tripod Stand", price: 1250, discountPrice: 990, stock: 38, description: "3 color temperatures and 10 brightness levels for live streaming.", image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80" },
    { name: "Magnetic Car Dashboard Phone Holder", price: 750, discountPrice: 590, stock: 65, description: "N52 neodymium magnets with 360-degree swivel arm.", image: "https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=800&q=80" },
    { name: "Rechargeable LED Desk Study Lamp with Clock", price: 1450, discountPrice: 1190, stock: 40, description: "Eye-care flicker-free LED with LCD temperature and calendar display.", image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80" },
    { name: "512GB High-Speed USB 3.2 Metal Flash Drive", price: 2950, discountPrice: 2590, stock: 30, description: "Dual Type-C and USB-A connectors with 150MB/s read speed.", image: "https://images.unsplash.com/photo-1625842268584-8f3296236761?w=800&q=80" },
    { name: "Smart Digital Body Weight Scale (Bluetooth)", price: 1650, discountPrice: 1390, stock: 28, description: "Tempered glass platform syncing BMI and body metrics to mobile app.", image: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&q=80" },
    { name: "3-Axis Handheld Smartphone Gimbal Stabilizer", price: 5400, discountPrice: 4790, stock: 15, description: "Anti-shake motorized gimbal with face tracking and gesture control.", image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80" },
    { name: "Neckband Wireless Sports Earphones (40H Playtime)", price: 1350, discountPrice: 1150, stock: 55, description: "Magnetic earbuds, IPX5 sweatproof, fast 10-minute charge.", image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&q=80" },
    { name: "Smart Wi-Fi Extension Power Strip (4 AC + 4 USB)", price: 1950, discountPrice: 1690, stock: 32, description: "Surge-protected smart power strip with individual app timers.", image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&q=80" },
    { name: "Portable Electric Mini Lint & Fabric Shaver", price: 850, discountPrice: 690, stock: 45, description: "USB-C rechargeable sweater and upholstery fuzz remover.", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80" },
    { name: "Stylus Touch Pen for iPad & Android Tablets", price: 1550, discountPrice: 1290, stock: 36, description: "Palm rejection, tilt sensitivity, and magnetic side attachment.", image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&q=80" },
    { name: "Gaming RGB Extended Mouse Pad (800x300mm)", price: 950, discountPrice: 790, stock: 50, description: "Micro-woven waterproof surface with 14 RGB edge glow modes.", image: "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=800&q=80" },
    { name: "Digital Infrared Non-Contact Thermometer", price: 1100, discountPrice: 890, stock: 40, description: "1-second instant fever reading with backlit LCD screen.", image: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&q=80" },
    { name: "Dual-Band AC1200 High-Gain Wi-Fi Router", price: 2750, discountPrice: 2390, stock: 24, description: "4 external 5dBi antennas supporting 2.4GHz and 5GHz speeds.", image: "https://images.unsplash.com/photo-1557324232-b8917d3c3dcb?w=800&q=80" },
    { name: "3-in-1 Foldable Wireless Charging Dock", price: 2990, discountPrice: 2550, stock: 26, description: "Charges phone, smartwatch, and wireless earbuds simultaneously.", image: "https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=800&q=80" },
  ],
};

const GENERIC_IMAGES = [
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80",
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80",
  "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&q=80",
  "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800&q=80",
  "https://images.unsplash.com/photo-1560343090-f0409e92791a?w=800&q=80",
];

export function buildThirtyProductsForCategory(
  categoryName: string,
  categorySlug: string
): ProductTemplate[] {
  const lower = `${categoryName} ${categorySlug}`.toLowerCase();

  if (
    lower.includes("perfume") ||
    lower.includes("attar") ||
    lower.includes("fragrance") ||
    lower.includes("oud")
  ) {
    return CATEGORY_TEMPLATES.perfume;
  }

  if (
    lower.includes("gadget") ||
    lower.includes("electronic") ||
    lower.includes("tech") ||
    lower.includes("mobile")
  ) {
    return CATEGORY_TEMPLATES.gadget;
  }

  const tiers = [
    { prefix: "Classic", basePrice: 490, discount: 420 },
    { prefix: "Essential", basePrice: 650, discount: 550 },
    { prefix: "Standard", basePrice: 790, discount: 690 },
    { prefix: "Comfort", basePrice: 950, discount: 820 },
    { prefix: "Deluxe", basePrice: 1150, discount: 990 },
    { prefix: "Premium", basePrice: 1350, discount: 1150 },
    { prefix: "Signature", basePrice: 1550, discount: 1320 },
    { prefix: "Executive", basePrice: 1850, discount: 1590 },
    { prefix: "Royal", basePrice: 2250, discount: 1890 },
    { prefix: "Masterpiece", basePrice: 2750, discount: 2350 },
  ];

  const editions = ["Edition A", "Pro Series", "Heritage Pack"];

  const items: ProductTemplate[] = [];
  for (let i = 0; i < 30; i++) {
    const tier = tiers[i % tiers.length];
    const edition = editions[Math.floor(i / tiers.length)];
    const price = tier.basePrice + Math.floor(i / 10) * 200;
    const discountPrice =
      i % 4 === 3 ? undefined : tier.discount + Math.floor(i / 10) * 180;

    items.push({
      name: `${tier.prefix} ${categoryName} — ${edition} #${i + 1}`,
      price,
      discountPrice,
      stock: 20 + ((i * 5) % 45),
      description: `Authentic ${tier.prefix.toLowerCase()} grade ${categoryName} item (${edition}). Quality checked with fast Cash on Delivery across Bangladesh.`,
      image: GENERIC_IMAGES[i % GENERIC_IMAGES.length],
    });
  }

  return items;
}

export async function seedCatalog(
  prisma: Pick<PrismaClient, "category" | "product">,
  forceUpdate: boolean,
) {
  const loadCategories = () => prisma.category.findMany({
    include: { subCategories: { orderBy: { id: "asc" } } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  let categories = await loadCategories();

  if (categories.length === 0) {
    const defaultCats = [
      { name: "Perfumes & Attar", slug: "perfumes-attar", sortOrder: 1 },
      { name: "Gadgets", slug: "gadgets", sortOrder: 2 },
      { name: "Books", slug: "books", sortOrder: 3 },
      { name: "Dates & Sunnah Foods", slug: "dates-sunnah-foods", sortOrder: 4 },
      { name: "Furniture", slug: "furniture", sortOrder: 5 },
      { name: "Home & Lifestyle", slug: "home-lifestyle", sortOrder: 6 },
    ];

    for (const c of defaultCats) {
      await prisma.category.upsert({
        where: { slug: c.slug },
        update: {},
        create: c,
      });
    }

    categories = await loadCategories();
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const category of categories) {
    const thirtyProducts = buildThirtyProductsForCategory(
      category.name,
      category.slug
    );
    const categoryHash = createHash("sha256").update(category.id).digest("hex").slice(0, 20);

    for (let idx = 0; idx < thirtyProducts.length; idx++) {
      const item = thirtyProducts[idx];
      const position = String(idx + 1).padStart(2, "0");
      const skuSlug = category.slug.toUpperCase();
      const sku = skuSlug.length <= 93
        ? `CAT-${skuSlug}-${position}`
        : `CAT-${skuSlug.slice(0, 72)}-${categoryHash}-${position}`;
      const skuHash = createHash("sha256").update(sku).digest("hex").slice(0, 20);
      const slug = `sample-${skuHash}-${position}`;

      const assignedSubCategoryId =
        category.subCategories.length > 0
          ? category.subCategories[idx % category.subCategories.length].id
          : null;

      const existing = await prisma.product.findUnique({
        where: { sku },
        select: { categoryId: true, _count: { select: { variants: true } } },
      });

      if (existing && existing.categoryId !== category.id) {
        throw new Error(`SKU ${sku} already belongs to a different category`);
      }

      if (!existing) {
        await prisma.product.create({
          data: {
            sku,
            name: item.name,
            slug,
            description: item.description,
            price: item.price,
            discountPrice: item.discountPrice ?? null,
            stock: item.stock,
            image: item.image,
            images: [item.image],
            isActive: true,
            categoryId: category.id,
            subCategoryId: assignedSubCategoryId,
          },
        });
        createdCount += 1;
      } else if (forceUpdate) {
        if (existing._count.variants > 0) {
          throw new Error(`Cannot overwrite ${sku}: it has product variants`);
        }
        await prisma.product.update({
          where: { sku },
          data: {
            name: item.name,
            description: item.description,
            price: item.price,
            discountPrice: item.discountPrice ?? null,
            stock: item.stock,
            image: item.image,
            images: [item.image],
            categoryId: category.id,
            subCategoryId: assignedSubCategoryId,
          },
        });
        updatedCount += 1;
      }
    }

    console.log(`Processed 30 sample products for category: ${category.name}`);
  }

  return { categories: categories.length, created: createdCount, updated: updatedCount };
}