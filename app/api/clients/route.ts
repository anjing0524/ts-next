import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/middleware';
import { z } from 'zod';

const getClientsSchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
  offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
  search: z.string().optional(),
  isActive: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
  isPublic: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
});

// GET /api/clients - List OAuth clients
export const GET = withAuth(
  async (request: NextRequest, context) => {
    const { searchParams } = new URL(request.url);
    
    try {
      // Validate query parameters
      const validation = getClientsSchema.safeParse({
        limit: searchParams.get('limit'),
        offset: searchParams.get('offset'),
        search: searchParams.get('search'),
        isActive: searchParams.get('isActive'),
        isPublic: searchParams.get('isPublic'),
      });

      if (!validation.success) {
        return NextResponse.json(
          { 
            error: 'invalid_request',
            error_description: 'Invalid query parameters',
            validation_errors: validation.error.flatten().fieldErrors
          },
          { status: 400 }
        );
      }

      const { limit, offset, search, isActive, isPublic } = validation.data;

      // Build where clause
      const where: any = {};
      
      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      if (isPublic !== undefined) {
        where.isPublic = isPublic;
      }

      if (search) {
        where.OR = [
          { clientId: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Get total count
      const totalCount = await prisma.client.count({ where });

      // Get clients with pagination
      const clients = await prisma.client.findMany({
        where,
        select: {
          id: true,
          clientId: true,
          name: true,
          description: true,
          isPublic: true,
          isActive: true,
          requirePkce: true,
          requireConsent: true,
          tokenEndpointAuthMethod: true,
          createdAt: true,
          updatedAt: true,
          // Don't include clientSecret for security
        },
        orderBy: [
          { createdAt: 'desc' },
          { name: 'asc' },
        ],
        take: Math.min(limit, 100), // Cap at 100
        skip: offset,
      });

      return NextResponse.json({
        clients,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
      });

    } catch (error) {
      console.error('Error fetching clients:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['clients:read'],
    requireUserContext: true,
  }
); 