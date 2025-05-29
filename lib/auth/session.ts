import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserSession } from '@prisma/client';
import crypto from 'crypto';

export interface SessionContext {
  user: User;
  session: UserSession;
}

/**
 * Validate user session from cookies
 */
export async function validateSession(request: NextRequest): Promise<SessionContext | null> {
  const sessionId = request.cookies.get('session_id')?.value;
  
  if (!sessionId) {
    return null;
  }

  try {
    const session = await prisma.userSession.findUnique({
      where: {
        sessionId,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!session || !session.user.isActive) {
      return null;
    }

    // Update last activity
    await prisma.userSession.update({
      where: { id: session.id },
      data: { lastActivity: new Date() },
    });

    return {
      user: session.user,
      session,
    };
  } catch (error) {
    console.error('Error validating session:', error);
    return null;
  }
}

/**
 * Create a new user session
 */
export async function createSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.userSession.create({
    data: {
      userId,
      sessionId,
      ipAddress,
      userAgent,
      expiresAt,
    },
  });

  return sessionId;
}

/**
 * Destroy a user session
 */
export async function destroySession(sessionId: string): Promise<void> {
  try {
    await prisma.userSession.update({
      where: { sessionId },
      data: { isActive: false },
    });
  } catch (error) {
    console.error('Error destroying session:', error);
  }
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<void> {
  try {
    await prisma.userSession.updateMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
  }
}

/**
 * Get user's active sessions
 */
export async function getUserSessions(userId: string): Promise<UserSession[]> {
  return prisma.userSession.findMany({
    where: {
      userId,
      isActive: true,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      lastActivity: 'desc',
    },
  });
} 