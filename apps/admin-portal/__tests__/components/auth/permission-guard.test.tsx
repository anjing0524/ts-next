import React from 'react';
import { render, screen } from '@testing-library/react';
import { PermissionGuard } from '@repo/ui';

describe('PermissionGuard Component', () => {
  const mockAdminUser = {
    permissions: ['admin:view', 'users:list'],
  };

  const mockRegularUser = {
    permissions: ['profile:view'],
  };

  it('should render children when user has the required permission', () => {
    render(
      <PermissionGuard
        user={mockAdminUser}
        isLoading={false}
        requiredPermission="admin:view"
      >
        <div>Protected Content</div>
      </PermissionGuard>
    );
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should render fallback when user does not have the required permission', () => {
    render(
      <PermissionGuard
        user={mockRegularUser}
        isLoading={false}
        requiredPermission="admin:view"
        fallback={<div>Access Denied</div>}
      >
        <div>Protected Content</div>
      </PermissionGuard>
    );
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render nothing by default when user does not have permission and no fallback is provided', () => {
    const { container } = render(
      <PermissionGuard
        user={mockRegularUser}
        isLoading={false}
        requiredPermission="admin:view"
      >
        <div>Protected Content</div>
      </PermissionGuard>
    );
    expect(container.firstChild).toBeNull();
  });

  it('should show a loading indicator when auth state is loading', () => {
    render(
      <PermissionGuard
        user={null}
        isLoading={true}
        requiredPermission="admin:view"
      >
        <div>Protected Content</div>
      </PermissionGuard>
    );
    // The component renders a Loader2 icon and a span. We can test for the text.
    expect(screen.getByText(/Verifying permissions.../i)).toBeInTheDocument();
  });

  it('should render fallback when user is not authenticated (user is null)', () => {
    render(
      <PermissionGuard
        user={null}
        isLoading={false}
        requiredPermission="admin:view"
        fallback={<div>Please Log In</div>}
      >
        <div>Protected Content</div>
      </PermissionGuard>
    );
    expect(screen.getByText('Please Log In')).toBeInTheDocument();
  });

  it('should handle an array of required permissions (AND logic)', () => {
    render(
      <PermissionGuard
        user={mockAdminUser}
        isLoading={false}
        requiredPermission={['admin:view', 'users:list']}
      >
        <div>Multi-permission Content</div>
      </PermissionGuard>
    );
    expect(screen.getByText('Multi-permission Content')).toBeInTheDocument();
  });

  it('should render fallback if user is missing one of the required permissions in the array', () => {
    render(
      <PermissionGuard
        user={mockAdminUser}
        isLoading={false}
        requiredPermission={['admin:view', 'users:delete']}
        fallback={<div>Missing Permissions</div>}
      >
        <div>Multi-permission Content</div>
      </PermissionGuard>
    );
    expect(screen.getByText('Missing Permissions')).toBeInTheDocument();
  });
});
