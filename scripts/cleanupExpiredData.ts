import { PrismaClient } from '@prisma/client';
import { logger } from '@repo/lib/utils'; // 导入自定义logger (Import custom logger)

const prisma = new PrismaClient();

async function cleanupExpiredData() {
  logger.info('Starting cleanup of expired data...');

  try {
    // 1. Cleanup Expired Access Tokens
    const now = new Date();
    const deletedAccessTokens = await prisma.accessToken.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });
    logger.info(`Deleted ${deletedAccessTokens.count} expired access tokens.`);

    // 2. Cleanup Expired Token Blacklist Entries
    const deletedBlacklistEntries = await prisma.tokenBlacklist.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });
    logger.info(`Deleted ${deletedBlacklistEntries.count} expired token blacklist entries.`);

    // 3. Cleanup Expired and Revoked Refresh Tokens
    // It's generally safer to only remove refresh tokens that are both expired AND already revoked.
    // If a refresh token is expired but not revoked, it might indicate an issue or a different lifecycle.
    // However, if expiresAt truly means hard expiry for refresh tokens, this condition could be just expiresAt < now.
    // For this script, we'll be cautious.
    const deletedRefreshTokens = await prisma.refreshToken.deleteMany({
      where: {
        AND: [
          {
            expiresAt: {
              lt: now,
            },
          },
          {
            isRevoked: true,
          },
        ],
      },
    });
    logger.info(`Deleted ${deletedRefreshTokens.count} expired and revoked refresh tokens.`);

    logger.info('Data cleanup completed successfully.');
  } catch (error) {
    logger.error('Error during data cleanup:', error);
    process.exitCode = 1; // Indicate failure
  } finally {
    await prisma.$disconnect();
    logger.info('Prisma client disconnected.');
  }
}

// Execute the cleanup function
cleanupExpiredData();

/**
 * How to run this script:
 * 1. Ensure your DATABASE_URL environment variable is correctly set.
 * 2. From the project root, run: `npx tsx scripts/cleanupExpiredData.ts`
 *
 * Scheduling:
 * This script should be scheduled to run periodically (e.g., daily) using a cron job
 * or a similar task scheduler in your deployment environment.
 * For example, a cron expression like `0 3 * * *` would run it at 3 AM every day.
 */
