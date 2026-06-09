/**
 * One-shot utility: set resellera@tebeee.com points to 1,000,000.
 *
 * Usage:  npm run update-points
 *
 * IMPORTANT: dotenv must be loaded before getPrisma() is called,
 * because the Neon adapter reads DATABASE_URL at construction time.
 */
import 'dotenv/config';
import { getPrisma, disconnectPrisma } from './client.js';

async function main() {
  const prisma = getPrisma();

  const user = await prisma.user.update({
    where: { email: 'resellera@tebeee.com' },
    data:  { points: 1_000_000 },
  });

  console.log(`Updated: ${user.name} → ${user.points} points`);
}

main().catch((err) => {
  // Prisma record-not-found throws P2025
  if (err?.code === 'P2025') {
    console.error('User not found: resellera@tebeee.com');
    process.exitCode = 0; // exit cleanly
  } else {
    console.error('[update-points] Unexpected error:', err.message ?? err);
    process.exitCode = 1;
  }
}).finally(async () => {
  await disconnectPrisma();
});
