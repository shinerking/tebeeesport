/**
 * Prisma Client singleton — Prisma 7 + Neon serverless adapter.
 *
 * Prisma 7 API: PrismaNeon({ connectionString }) — no Pool needed.
 * The client is created lazily so DATABASE_URL is read after dotenv loads.
 */
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

let _prisma = null;

export function getPrisma() {
  if (_prisma) return _prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      '[Prisma] DATABASE_URL is not set. ' +
      'Ensure your .env file contains DATABASE_URL and dotenv is loaded before calling getPrisma().'
    );
  }

  const adapter = new PrismaNeon({ connectionString });

  _prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

  return _prisma;
}

export async function disconnectPrisma() {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}

export default getPrisma;
