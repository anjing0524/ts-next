import { NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma'; // Verified path
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import logger from '@/utils/logger'; // Import logger

// Zod schema for client registration
const clientRegisterSchema = z.object({
  name: z.string().min(1, { message: "Client name is required" }),
  redirectUris: z.string().min(1, { message: "At least one redirect URI is required" })
                   .refine(value => {
                     const uris = value.split(',').map(uri => uri.trim());
                     return uris.every(uri => {
                       if (uri === '') return false;
                       return z.string().url({ message: `Invalid URL: ${uri}` }).safeParse(uri).success;
                     });
                   }, { message: "One or more redirect URIs are invalid. Ensure they are valid URLs and comma-separated if multiple." }),
});

const prisma = new PrismaClient();

export async function POST(request: Request) {
  let clientNameForLogging: string | undefined = undefined; // For logging in catch

  try {
    const body = await request.json();
    const validation = clientRegisterSchema.safeParse(body);

    if (!validation.success) {
      // Note: Client name is not available here if parsing/validation fails early for name itself
      logger.warn('Client registration attempt failed due to invalid request body', { errors: validation.error.flatten().fieldErrors });
      return NextResponse.json({ errors: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { name, redirectUris } = validation.data;
    clientNameForLogging = name; // Set for logging
    logger.info(`Client registration attempt received for client name: ${name}`);

    const clientId = uuidv4();
    const clientSecret = randomBytes(32).toString('hex');

    const newClient = await prisma.client.create({
      data: {
        clientId,
        clientSecret, 
        name,
        redirectUris,
      },
    });

    logger.info(`Client registration success for clientId: ${newClient.clientId}, client name: ${name}`);
    return NextResponse.json({
      message: "Client registered successfully",
      clientId: newClient.clientId,
      clientSecret: clientSecret, 
    }, { status: 201 });

  } catch (error: any) {
    if (error.code === 'P2002' && error.meta?.target) {
      const targetFields = Array.isArray(error.meta.target) ? error.meta.target.join(', ') : String(error.meta.target);
      logger.warn(`Client registration failure - unique constraint violation for client name: ${clientNameForLogging || 'unknown'}. Target: ${targetFields}`, { error });
      return NextResponse.json({ message: `Client registration failed: A client with the same '${targetFields}' already exists.` }, { status: 409 });
    }
    logger.error(`Internal server error during client registration for client name: ${clientNameForLogging || 'unknown'}`, { error });
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
  // No finally block for prisma.$disconnect() as prisma is a global instance here.
}
