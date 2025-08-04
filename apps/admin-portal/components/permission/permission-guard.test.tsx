/**
 * Component tests for PermissionGuard
 */

import { render, screen, fireEvent, waitFor } from '../../test/test-utils';
import { PermissionGuard, RoleGuard, AnyPermissionGuard, AllPermissionsGuard } from '@/components/permission/permission-guard';
import { usePermission, useRole, usePermissions } from '@/hooks/use-permission';

// Mock the usePermission hook
jest.mock('@/hooks/use-permission', () => ({
  usePermission: jest.fn(),
  useRole: jest.fn(),
  usePermissions: jest.fn(),
  useUserContext: jest.fn(),
}));

describe('PermissionGuard', () => {
  const mockUsePermission = usePermission as jest.MockedFunction<typeof usePermission>;
  const mockUseRole = useRole as jest.MockedFunction<typeof useRole>;
  const mockUsePermissions = usePermissions as jest.MockedFunction<typeof usePermissions>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PermissionGuard', () => {
    it('renders children when user has permission', () => {
      mockUsePermission.mockReturnValue({
        hasPermission: true,
        loading: false,
        error: null,
      });

      render(
        <PermissionGuard permissionId="read:dashboard">
          <div>Protected Content</div>
        </PermissionGuard>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('shows loading state while checking permission', () => {
      mockUsePermission.mockReturnValue({
        hasPermission: false,
        loading: true,
        error: null,
      });

      render(
        <PermissionGuard permissionId="read:dashboard">
          <div>Protected Content</div>
        </PermissionGuard>
      );

      expect(screen.getByText('检查权限中...')).toBeInTheDocument();
    });

    it('shows access denied when user lacks permission', () => {
      mockUsePermission.mockReturnValue({
        hasPermission: false,
        loading: false,
        error: null,
      });

      render(
        <PermissionGuard permissionId="read:dashboard">
          <div>Protected Content</div>
        </PermissionGuard>
      );

      expect(screen.getByText('您没有访问此功能的权限')).toBeInTheDocument();
    });

    it('shows error when permission check fails', () => {
      mockUsePermission.mockReturnValue({
        hasPermission: false,
        loading: false,
        error: 'Permission check failed',
      });

      render(
        <PermissionGuard permissionId="read:dashboard">
          <div>Protected Content</div>
        </PermissionGuard>
      );

      expect(screen.getByText('权限检查失败')).toBeInTheDocument();
    });

    it('renders fallback when provided', () => {
      mockUsePermission.mockReturnValue({
        hasPermission: false,
        loading: false,
        error: null,
      });

      render(
        <PermissionGuard 
          permissionId="read:dashboard" 
          fallback={<div>Custom Fallback</div>}
        >
          <div>Protected Content</div>
        </PermissionGuard>
      );

      expect(screen.getByText('Custom Fallback')).toBeInTheDocument();
    });

    it('hides access denied when showAccessDenied is false', () => {
      mockUsePermission.mockReturnValue({
        hasPermission: false,
        loading: false,
        error: null,
      });

      render(
        <PermissionGuard 
          permissionId="read:dashboard" 
          showAccessDenied={false}
        >
          <div>Protected Content</div>
        </PermissionGuard>
      );

      expect(screen.queryByText('您没有访问此功能的权限')).not.toBeInTheDocument();
    });
  });

  describe('RoleGuard', () => {
    it('renders children when user has role', () => {
      mockUseRole.mockReturnValue({
        hasRole: true,
        loading: false,
        error: null,
      });

      render(
        <RoleGuard roleId="admin">
          <div>Admin Content</div>
        </RoleGuard>
      );

      expect(screen.getByText('Admin Content')).toBeInTheDocument();
    });

    it('shows access denied when user lacks role', () => {
      mockUseRole.mockReturnValue({
        hasRole: false,
        loading: false,
        error: null,
      });

      render(
        <RoleGuard roleId="admin">
          <div>Admin Content</div>
        </RoleGuard>
      );

      expect(screen.getByText('您没有访问此功能的角色权限')).toBeInTheDocument();
    });
  });

  describe('AnyPermissionGuard', () => {
    it('renders children when user has any of the permissions', () => {
      mockUsePermissions.mockReturnValue({
        permissions: {
          'read:dashboard': true,
          'write:dashboard': false,
        },
        loading: false,
        error: null,
      });

      render(
        <AnyPermissionGuard permissionIds={['read:dashboard', 'write:dashboard']}>
          <div>Protected Content</div>
        </AnyPermissionGuard>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('shows access denied when user has none of the permissions', () => {
      mockUsePermissions.mockReturnValue({
        permissions: {
          'read:dashboard': false,
          'write:dashboard': false,
        },
        loading: false,
        error: null,
      });

      render(
        <AnyPermissionGuard permissionIds={['read:dashboard', 'write:dashboard']}>
          <div>Protected Content</div>
        </AnyPermissionGuard>
      );

      expect(screen.getByText('您没有访问此功能的权限')).toBeInTheDocument();
    });
  });

  describe('AllPermissionsGuard', () => {
    it('renders children when user has all permissions', () => {
      mockUsePermissions.mockReturnValue({
        permissions: {
          'read:dashboard': true,
          'write:dashboard': true,
        },
        loading: false,
        error: null,
      });

      render(
        <AllPermissionsGuard permissionIds={['read:dashboard', 'write:dashboard']}>
          <div>Protected Content</div>
        </AllPermissionsGuard>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('shows access denied when user lacks any permission', () => {
      mockUsePermissions.mockReturnValue({
        permissions: {
          'read:dashboard': true,
          'write:dashboard': false,
        },
        loading: false,
        error: null,
      });

      render(
        <AllPermissionsGuard permissionIds={['read:dashboard', 'write:dashboard']}>
          <div>Protected Content</div>
        </AllPermissionsGuard>
      );

      expect(screen.getByText('您没有访问此功能的全部权限')).toBeInTheDocument();
    });
  });
});