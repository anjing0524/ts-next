import { NextRequest, NextResponse } from 'next/server';

import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/prisma';

const createScopeSchema = z.object({
  name: z
    .string()
    .min(1, 'Scope name is required')
    .max(100, 'Scope name must be less than 100 characters')
    .regex(
      /^[a-zA-Z0-9:_-]+$/,
      'Scope name can only contain letters, numbers, colons, underscores, and hyphens'
    ),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  isDefault: z.boolean().default(false),
  isPublic: z.boolean().default(true),
});

const updateScopeSchema = z.object({
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  isDefault: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/scopes - List all scopes
export const GET = withAuth(
  async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const isPublic = searchParams.get('isPublic');
    const isDefault = searchParams.get('isDefault');

    try {
      const where: Prisma.ScopeWhereInput = {};

      if (!includeInactive) {
        where.isActive = true;
      }

      if (isPublic !== null) {
        where.isPublic = isPublic === 'true';
      }

      if (isDefault !== null) {
        where.isDefault = isDefault === 'true';
      }

      const scopes = await prisma.scope.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      });

      return NextResponse.json({ scopes });
    } catch (error) {
      console.error('Error fetching scopes:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['scopes:read'],
    requireUserContext: true,
  }
);

// POST /api/scopes - Create a new scope
export const POST = withAuth(
  async (request: NextRequest) => {
    try {
      const body = await request.json();

      // Validate input
      const validation = createScopeSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          {
            error: 'invalid_request',
            error_description: 'Validation failed',
            validation_errors: validation.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }

      const { name, description, isDefault, isPublic } = validation.data;

      // Check if scope already exists
      const existingScope = await prisma.scope.findUnique({
        where: { name },
      });

      if (existingScope) {
        return NextResponse.json({ error: 'Scope with this name already exists' }, { status: 409 });
      }

      // Create scope
      const scope = await prisma.scope.create({
        data: {
          name,
          description,
          isDefault,
          isPublic,
        },
      });

      return NextResponse.json(
        {
          message: 'Scope created successfully',
          scope,
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Error creating scope:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['scopes:write'],
    requireUserContext: true,
  }
);

// PUT /api/scopes - Update a scope
export const PUT = withAuth(
  async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);
    const scopeName = searchParams.get('name');

    if (!scopeName) {
      return NextResponse.json({ error: 'Scope name parameter is required' }, { status: 400 });
    }

    try {
      const body = await request.json();

      // Validate input
      const validation = updateScopeSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          {
            error: 'invalid_request',
            error_description: 'Validation failed',
            validation_errors: validation.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }

      // Check if scope exists
      const existingScope = await prisma.scope.findUnique({
        where: { name: scopeName },
      });

      if (!existingScope) {
        return NextResponse.json({ error: 'Scope not found' }, { status: 404 });
      }

      // Update scope
      const updatedScope = await prisma.scope.update({
        where: { name: scopeName },
        data: validation.data,
      });

      return NextResponse.json({
        message: 'Scope updated successfully',
        scope: updatedScope,
      });
    } catch (error) {
      console.error('Error updating scope:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['scopes:write'],
    requireUserContext: true,
  }
);

// DELETE /api/scopes - Delete/deactivate a scope
export const DELETE = withAuth(
  async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);
    const scopeName = searchParams.get('name');

    if (!scopeName) {
      return NextResponse.json({ error: 'Scope name parameter is required' }, { status: 400 });
    }

    try {
      // Check if scope exists
      const existingScope = await prisma.scope.findUnique({
        where: { name: scopeName },
      });

      if (!existingScope) {
        return NextResponse.json({ error: 'Scope not found' }, { status: 404 });
      }

      // Soft delete - mark as inactive
      await prisma.scope.update({
        where: { name: scopeName },
        data: { isActive: false },
      });

      return NextResponse.json({
        message: 'Scope deactivated successfully',
      });
    } catch (error) {
      console.error('Error deleting scope:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['scopes:delete'],
    requireUserContext: true,
  }
);
