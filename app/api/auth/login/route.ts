import { NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma'; // Verified path
import bcrypt from 'bcrypt';
import { z } from 'zod';
import logger from '@/utils/logger'; // Import logger

const loginSchema = z.object({
  username: z.string().min(1, { message: "Username is required" }),
  password: z.string().min(1, { message: "Password is required" }),
});

export async function POST(request: Request) {
  const prisma = new PrismaClient(); // Instantiate client inside the handler
  let usernameForLogging: string | undefined = undefined; // For logging in catch/finally

  try {
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      // Note: Username is not available here if parsing/validation fails early for username itself
      logger.warn('Login attempt failed due to invalid request body', { errors: validation.error.flatten().fieldErrors });
      return NextResponse.json({ errors: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { username, password } = validation.data;
    usernameForLogging = username; // Set for logging
    logger.info(`Login attempt received for username: ${username}`);

    const user = await prisma.user.findUnique({
      where: { username },
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

    logger.info(`Login success for userId: ${user.id}, username: ${username}`);
    return NextResponse.json({ message: "Login successful", userId: user.id }, { status: 200 });

  } catch (error) {
    logger.error(`Internal server error during login for username: ${usernameForLogging || 'unknown'}`, { error });
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  } finally {
    await prisma.$disconnect(); 
    if (usernameForLogging) {
        logger.debug(`Login request processing finished for username: ${usernameForLogging}`);
    } else {
        logger.debug(`Login request processing finished for an attempt with missing/invalid username.`);
    }
  }
}
