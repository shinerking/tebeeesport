/**
 * Prisma Seeder — backend/prisma/seed.js
 *
 * Stack : Node.js ESM + Prisma 7 + PrismaNeon adapter + Neon PostgreSQL
 * Auth  : Passwords stored as plain text strings (flag: no bcrypt used — add
 *         hashing in production via `npm install bcrypt` and wrap each value).
 * Safe  : All upserts — fully idempotent, safe to re-run without duplicates.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

// ─── Prisma client (Prisma 7 Neon adapter) ──────────────────────────────────
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ─── Helpers ────────────────────────────────────────────────────────────────
const randomStock = () => Math.floor(Math.random() * 11) + 5;       // 5–15
const randomPrice = () => (Math.floor(Math.random() * 201) + 400) * 1000; // 400000–600000

// ─── Seed data ──────────────────────────────────────────────────────────────
const USERS = [
  {
    name: 'Admin Tebeee',
    email: 'admin@tebeee.com',
    phone: '+6281200000001',
    role: 'ADMIN',
    points: 0,
  },
  {
    name: 'Reseller Store A',
    email: 'resellera@tebeee.com',
    phone: '+6281200000002',
    role: 'RESELLER',
    points: 50,
  },
  {
    name: 'Reseller Store B',
    email: 'resellerb@tebeee.com',
    phone: '+6281200000003',
    role: 'RESELLER',
    points: 50,
  },
];

const PRODUCTS = [
  {
    name: '910 Nineten Haze Vision',
    category: 'Running',
    description: 'Lightweight trail running shoe with haze-resistant upper and Vision outsole technology.',
  },
  {
    name: 'Specs Lightspeed Reborn',
    category: 'Running',
    description: 'Reborn edition of the iconic Lightspeed with enhanced cushioning and breathable mesh.',
  },
  {
    name: '910 Nineten Yuki',
    category: 'Running',
    description: 'Cold-weather performance runner inspired by snow (Yuki), featuring insulated lining.',
  },
];

const SIZES = ['39', '40', '41', '42'];

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Starting seed…\n');

  // ── Users ────────────────────────────────────────────────────────────────
  console.log('👤 Seeding users…');
  for (const user of USERS) {
    const record = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        phone: user.phone,
        role: user.role,
        points: user.points,
      },
      create: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        points: user.points,
      },
    });
    console.log(`  ✓ ${record.role.padEnd(8)} — ${record.name} <${record.email}>`);
  }

  // ── Products + Variants ──────────────────────────────────────────────────
  console.log('\n👟 Seeding products + variants…');
  for (const product of PRODUCTS) {
    // Upsert the product (unique on name)
    const savedProduct = await prisma.product.upsert({
      where: { name: product.name },
      update: {
        category: product.category,
        description: product.description,
      },
      create: {
        name: product.name,
        category: product.category,
        description: product.description,
      },
    });

    // Delete existing variants so re-runs don't stack duplicates
    await prisma.variant.deleteMany({
      where: { productId: savedProduct.id },
    });

    // Build variant rows
    const variantData = SIZES.map((size) => ({
      productId: savedProduct.id,
      size,
      stock: randomStock(),
      price: randomPrice(),
    }));

    // Insert all variants in a single transaction
    await prisma.$transaction(
      variantData.map((v) => prisma.variant.create({ data: v }))
    );

    console.log(`  ✓ ${savedProduct.name} (${savedProduct.category})`);
    variantData.forEach((v) =>
      console.log(`      size ${v.size} — stock: ${v.stock}, price: ${v.price.toLocaleString('id-ID')}`)
    );
  }

  console.log('\n✅ Seed complete.');
}

// ─── Run ─────────────────────────────────────────────────────────────────────
main()
  .catch((err) => {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
