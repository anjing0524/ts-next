import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Correct Prisma import
import bcrypt from 'bcrypt';
import { z } from 'zod';
import logger from '@/utils/logger'; // Import logger
import { SignJWT } from 'jose'; // JWT import for SignJWT

const loginSchema = z.object({
  username: z.string().min(1, { message: "Username is required" }),
  password: z.string().min(1, { message: "Password is required" }),
});

export async function POST(request: Request) {
  // const prisma = new PrismaClient(); // Removed: Prisma is now imported as a singleton
  let usernameForLogging: string | undefined = undefined; // For logging in catch/finally

  try {
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      logger.warn('Login attempt failed due to invalid request body', { errors: validation.error.flatten().fieldErrors });
      return NextResponse.json({ errors: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { username, password } = validation.data;
    usernameForLogging = username; // Set for logging
    logger.info(`Login attempt received for username: ${username}`);

    const user = await prisma.user.findUnique({
      where: { username },
      // If permissions are on a related table, include them:
      // include: { roles: { include: { role: { include: { permissions: true } } } } }
    });

    if (!user) {
      logger.warn(`Login failure - user not found for username: ${username}`);
      return NextResponse.json({ message: "Invalid username or password" }, { status: 401 });
    }

    if (user.password == null) {
        logger.error(`Authentication error - password not set for username: ${username}`);
        return NextResponse.json({ message: "Authentication error" }, { status: 500 });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      logger.warn(`Login failure - password mismatch for username: ${username}`);
      return NextResponse.json({ message: "Invalid username or password" }, { status: 401 });
    }

    // Fetch user permissions (placeholder logic)
    // TODO: Implement actual permission fetching based on user roles or direct assignments
    // For example, if user.permissions is a direct field (e.g., string[] from JSON type in DB):
    // const userPermissions = (user as any).permissions || [];
    // Or if fetched via relations (adjust based on your actual Prisma schema):
    // const userPermissions = user.roles?.flatMap((userRole: any) => userRole.role.permissions.map((p: any) => p.name)) || [];
    // For this example, using a simple placeholder:
    const userPermissions: string[] = (user as any).permissions || ['read:own_account', 'write:own_account']; // Placeholder

    const secretKey = process.env.JWT_ACCESS_TOKEN_SECRET;
    const issuer = process.env.JWT_ISSUER;
    const audience = process.env.JWT_AUDIENCE;

    if (!secretKey || !issuer || !audience) {
      logger.error(`JWT configuration error for user: ${user.username} - missing secret, issuer, or audience. Check .env file.`);
      return NextResponse.json({ message: "Internal server error - JWT configuration" }, { status: 500 });
    }

    const alg = 'HS256';
    const jwtSecret = new TextEncoder().encode(secretKey);

    const accessToken = await new SignJWT({ 
        permissions: userPermissions, 
        userId: user.id,
        // You can add other custom claims here if needed, e.g., username, roles
        username: user.username 
      })
      .setProtectedHeader({ alg })
      .setSubject(user.id.toString()) // Standard claim for user identifier
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime('2h') // Access token lifetime
      .setIssuedAt() // Optional: adds 'iat' (issued at) claim
      .sign(jwtSecret);

    logger.info(`Login success, JWT generated for userId: ${user.id}, username: ${user.username}`);
    // Return the token
    return NextResponse.json({ message: "Login successful", userId: user.id, accessToken }, { status: 200 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Internal server error during login for username: ${usernameForLogging || 'unknown'}`, { error: errorMessage, stack: (error instanceof Error ? error.stack : undefined) });
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  } finally {
    // await prisma.$disconnect(); // Removed: Prisma is a singleton, no manual disconnect needed here
    if (usernameForLogging) {
        logger.debug(`Login request processing finished for username: ${usernameForLogging}`);
    } else {
        logger.debug(`Login request processing finished for an attempt with missing/invalid username.`);
    }
  }
}
