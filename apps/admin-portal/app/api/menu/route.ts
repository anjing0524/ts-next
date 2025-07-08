import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { JWTUtils } from '@repo/lib/auth'; // Corrected import
import { adminApi } from '@/lib/api'; // Corrected import

// Helper function to filter menu items based on user permissions
function filterMenuItems(menuItems: any[], userPermissions: string[]): any[] {
  return menuItems
    .filter((item) => {
      // If item has no specific permissions, it's visible by default
      if (!item.permissions || item.permissions.length === 0) {
        return true;
      }
      // Check if user has any of the required permissions for this item
      return item.permissions.some((perm: string) => userPermissions.includes(perm));
    })
    .map((item) => {
      // Recursively filter children
      if (item.children && item.children.length > 0) {
        return {
          ...item,
          children: filterMenuItems(item.children, userPermissions),
        };
      }
      return item;
    })
    .filter((item) => {
      // Remove parent items if all their children were filtered out
      return !item.children || item.children.length > 0 || item.path !== '#';
    })
    .sort((a, b) => a.order - b.order); // Sort by order
}

export async function GET() {
  try {
    const token = (await cookies()).get('access_token')?.value;

    if (!token) {
      // If no token, return only public menu items or an empty array
      // For now, we fetch all menus and filter by empty permissions
      const allMenus = await adminApi.getMenus();
      return NextResponse.json(filterMenuItems(allMenus, []), { status: 200 });
    }

    // Verify token and get user permissions
    const verificationResult = await JWTUtils.verifyToken(token); // Corrected function call
    if (!verificationResult.valid || !verificationResult.payload?.sub) { // Check for valid payload and user ID (sub)
      const allMenus = await adminApi.getMenus();
      return NextResponse.json(filterMenuItems(allMenus, []), { status: 200 });
    }

    // Fetch user's actual permissions from the backend
    // This is crucial for dynamic, real-time permission checks
    const userPermissions = verificationResult.payload.permissions as string[] || [];

    const allMenus = await adminApi.getMenus();
    const filtered = filterMenuItems(allMenus, userPermissions);
    return NextResponse.json(filtered, { status: 200 });
  } catch (error) {
    console.error('Error fetching menu items:', error);
    // In case of any error, return a safe, minimal menu
    const allMenus = await adminApi.getMenus();
    return NextResponse.json(filterMenuItems(allMenus, []), { status: 200 });
  }
}

