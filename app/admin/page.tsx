'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

import {
  Users,
  Settings,
  Shield,
  Key,
  Activity,
  LogOut,
  Plus,
  Eye,
  Edit,
  Trash2,
  Users2, // Icon for Roles
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  // DialogTrigger, // Not using Trigger directly for these modals
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select'; // Assuming this path
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea'; // Added for role description
import { authApi, adminApi } from '@/lib/api';

interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
  password?: string; // Added for creating users
  roles?: string[]; // Added for future role management
}

// Interface for Permissions (as defined in subtask)
interface Permission {
  id: string;
  name: string;
  description?: string;
}

// Interface for Roles (as defined in subtask)
interface Role {
  id: string;
  name: string;
  description: string;
  permissions?: Permission[]; // Will be fetched/mapped for view/edit
  permissionIds?: string[]; // Used for create/update
  createdAt?: string;
}

// Updated and renamed interface for OAuth Clients
interface OAuthClient {
  id: string;
  clientId: string;
  name: string;
  description: string;
  isPublic: boolean; // true for public, false for confidential
  isActive: boolean;
  redirectUris: string[];
  scopes: string[]; // Changed from 'scope: string'
  clientSecret?: string; // Optional, for display after creation or regeneration
  createdAt?: string;
}

// Interface for OAuth Scopes (for selection in forms and CRUD)
interface OAuthScope {
  id: string;
  name: string;
  description: string; // Made non-optional for CRUD forms
  isDefault?: boolean;
  isRestricted?: boolean;
  createdAt?: string;
}

interface UserInfo {
  sub: string;
  name: string;
  preferred_username: string;
  email: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<OAuthClient[]>([]); // Renamed Client to OAuthClient
  const [isLoading, setIsLoading] = useState(true); // General loading for initial page
  const [activeTab, setActiveTab] = useState('overview');

  // State variables for User Management Modals
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [isViewUserModalOpen, setIsViewUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    isActive: true,
  });

  // State variables for Role Management
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [isAddRoleModalOpen, setIsAddRoleModalOpen] = useState(false);
  const [isEditRoleModalOpen, setIsEditRoleModalOpen] = useState(false);
  const [isViewRoleModalOpen, setIsViewRoleModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [newRoleData, setNewRoleData] = useState<{
    name: string;
    description: string;
    permissionIds: string[];
  }>({
    name: '',
    description: '',
    permissionIds: [],
  });
  const [editRoleData, setEditRoleData] = useState<{
    id: string;
    name: string;
    description: string;
    permissionIds: string[];
  } | null>(null);

  // State variables for Permission Management
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(true);
  const [isAddPermissionModalOpen, setIsAddPermissionModalOpen] = useState(false);
  const [isEditPermissionModalOpen, setIsEditPermissionModalOpen] = useState(false);
  const [isViewPermissionModalOpen, setIsViewPermissionModalOpen] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);
  const [newPermissionData, setNewPermissionData] = useState<{ name: string; description: string }>(
    {
      name: '',
      description: '',
    }
  );
  const [editPermissionData, setEditPermissionData] = useState<{
    id: string;
    name: string;
    description: string;
  } | null>(null);

  // State variables for OAuthClient Management
  const [oauthScopes, setOAuthScopes] = useState<OAuthScope[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true); // Specific for clients tab
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false);
  const [isViewClientModalOpen, setIsViewClientModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<OAuthClient | null>(null);
  const [newClientData, setNewClientData] = useState<{
    name: string;
    description: string;
    isPublic: boolean;
    redirectUris: string[];
    scopes: string[];
  }>({
    name: '',
    description: '',
    isPublic: false,
    redirectUris: [],
    scopes: [],
  });
  const [editClientData, setEditClientData] = useState<OAuthClient | null>(null);
  const [newlyCreatedClientSecret, setNewlyCreatedClientSecret] = useState<string | null>(null);

  // State variables for OAuth Scope Management
  const [isLoadingOAuthScopes, setIsLoadingOAuthScopes] = useState(true); // Specific for scope section
  const [isAddScopeModalOpen, setIsAddScopeModalOpen] = useState(false);
  const [isEditScopeModalOpen, setIsEditScopeModalOpen] = useState(false);
  // No ViewScopeModal specified, Edit/List covers display.
  const [selectedOAuthScope, setSelectedOAuthScope] = useState<OAuthScope | null>(null);
  const [newOAuthScopeData, setNewOAuthScopeData] = useState<{
    name: string;
    description: string;
    isDefault?: boolean;
    isRestricted?: boolean;
  }>({
    name: '',
    description: '',
    isDefault: false,
    isRestricted: false,
  });
  const [editOAuthScopeData, setEditOAuthScopeData] = useState<OAuthScope | null>(null);

  const handleNewRoleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setNewRoleData((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleNewRolePermissionsChange = (selectedPermissionIds: string[]) => {
    setNewRoleData((prevState) => ({
      ...prevState,
      permissionIds: selectedPermissionIds,
    }));
  };

  const handleEditRoleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setEditRoleData((prevState) => {
      if (!prevState) return null;
      return { ...prevState, [name]: value };
    });
  };

  const handleEditRolePermissionsChange = (selectedPermissionIds: string[]) => {
    setEditRoleData((prevState) => {
      if (!prevState) return null;
      return { ...prevState, permissionIds: selectedPermissionIds };
    });
  };

  const handleNewUserInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewUser((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleNewUserSwitchChange = (checked: boolean) => {
    setNewUser((prevState) => ({
      ...prevState,
      isActive: checked,
    }));
  };

  const handleSelectedUserInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSelectedUser((prevUser) => {
      if (!prevUser) return null;
      return {
        ...prevUser,
        [name]: value,
      };
    });
  };

  const handleSelectedUserSwitchChange = (checked: boolean) => {
    setSelectedUser((prevUser) => {
      if (!prevUser) return null;
      return {
        ...prevUser,
        isActive: checked,
      };
    });
  };

  useEffect(() => {
    loadUserInfo();
    loadUsers();
    loadClients();
    loadRoles(); // Call loadRoles
    loadPermissions(); // Call loadPermissions
  }, []);

  const loadUserInfo = async () => {
    try {
      const token = sessionStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }

      const data = await authApi.getUserInfo();
      setUserInfo(data);
    } catch (error) {
      console.error('Error loading user info:', error);
      router.push('/login');
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    try {
      // Simulate API Call
      // const updatedUser = await adminApi.updateUser(selectedUser.id, selectedUser); // Actual API call
      console.log('Attempting to update user with data:', selectedUser);
      // Simulate success:
      alert('User updated successfully (Simulated)');
      loadUsers(); // Refresh users list
      setIsEditUserModalOpen(false); // Close modal
      setSelectedUser(null); // Clear selected user
    } catch (error) {
      console.error('Error updating user:', error);
      alert(`Error updating user: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };

  // --- Role Management Handlers ---
  const handleAddRoleClick = () => {
    setNewRoleData({ name: '', description: '', permissionIds: [] });
    setIsAddRoleModalOpen(true);
  };

  const handleEditRoleClick = (role: Role) => {
    setSelectedRole(role);
    // Ensure permissionIds is an array, even if role.permissions is not populated yet
    const currentPermissionIds =
      role.permissionIds || (role.permissions ? role.permissions.map((p) => p.id) : []);
    setEditRoleData({
      id: role.id,
      name: role.name,
      description: role.description,
      permissionIds: currentPermissionIds,
    });
    setIsEditRoleModalOpen(true);
  };

  const handleViewRoleClick = (role: Role) => {
    setSelectedRole(role);
    // If role.permissions is not populated, you might want to fetch them here
    // For now, we assume it might be populated or we rely on permissionIds for basic view
    setIsViewRoleModalOpen(true);
  };

  const handleDeleteRoleConfirmation = (roleId: string) => {
    if (
      window.confirm('Are you sure you want to delete this role? This action cannot be undone.')
    ) {
      handleDeleteRole(roleId);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    try {
      // Simulate API: await adminApi.deleteRole(roleId);
      console.log(`Simulating delete for role ID: ${roleId}`);
      alert('Role deleted successfully (Simulated)');
      loadRoles();
    } catch (error) {
      console.error('Error deleting role:', error);
      alert(`Error deleting role: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };

  const handleCreateRole = async () => {
    try {
      // Simulate API: await adminApi.createRole(newRoleData);
      console.log('Simulating create role with data:', newRoleData);
      alert('Role created successfully (Simulated)');
      loadRoles();
      setIsAddRoleModalOpen(false);
      setNewRoleData({ name: '', description: '', permissionIds: [] });
    } catch (error) {
      console.error('Error creating role:', error);
      alert(`Error creating role: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };

  const handleUpdateRole = async () => {
    if (!editRoleData) return;
    try {
      // Simulate API: await adminApi.updateRole(editRoleData.id, editRoleData);
      console.log('Simulating update role with data:', editRoleData);
      alert('Role updated successfully (Simulated)');
      loadRoles();
      setIsEditRoleModalOpen(false);
      setEditRoleData(null);
    } catch (error) {
      console.error('Error updating role:', error);
      alert(`Error updating role: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };
  // --- End Role Management Handlers ---

  // --- Permission Management Handlers ---
  const handleNewPermissionInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setNewPermissionData((prevState) => ({ ...prevState, [name]: value }));
  };

  const handleEditPermissionInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setEditPermissionData((prevState) => {
      if (!prevState) return null;
      return { ...prevState, [name]: value };
    });
  };

  const handleAddPermissionClick = () => {
    setNewPermissionData({ name: '', description: '' });
    setIsAddPermissionModalOpen(true);
  };

  const handleEditPermissionClick = (permission: Permission) => {
    setSelectedPermission(permission);
    setEditPermissionData({
      id: permission.id,
      name: permission.name,
      description: permission.description || '',
    });
    setIsEditPermissionModalOpen(true);
  };

  const handleViewPermissionClick = (permission: Permission) => {
    setSelectedPermission(permission);
    setIsViewPermissionModalOpen(true);
  };

  const handleDeletePermissionConfirmation = (permissionId: string) => {
    if (
      window.confirm(
        'Are you sure you want to delete this permission? This might affect roles that use it.'
      )
    ) {
      handleDeletePermission(permissionId);
    }
  };

  const handleDeletePermission = async (permissionId: string) => {
    try {
      // Simulate API: await adminApi.deletePermission(permissionId);
      console.log(`Simulating delete for permission ID: ${permissionId}`);
      alert('Permission deleted successfully (Simulated).');
      loadPermissions();
    } catch (error) {
      console.error('Error deleting permission:', error);
      alert(`Error deleting permission: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };

  const handleCreatePermission = async () => {
    try {
      // Simulate API: await adminApi.createPermission(newPermissionData);
      console.log('Simulating create permission with data:', newPermissionData);
      alert('Permission created successfully (Simulated).');
      loadPermissions();
      setIsAddPermissionModalOpen(false);
      setNewPermissionData({ name: '', description: '' });
    } catch (error) {
      console.error('Error creating permission:', error);
      alert(`Error creating permission: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };

  const handleUpdatePermission = async () => {
    if (!editPermissionData) return;
    try {
      // Simulate API: await adminApi.updatePermission(editPermissionData.id, editPermissionData);
      console.log('Simulating update permission with data:', editPermissionData);
      alert('Permission updated successfully (Simulated).');
      loadPermissions();
      setIsEditPermissionModalOpen(false);
      setEditPermissionData(null);
    } catch (error) {
      console.error('Error updating permission:', error);
      alert(`Error updating permission: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };
  // --- End Permission Management Handlers ---

  // --- OAuth Client Management Handlers ---
  const handleNewClientInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setNewClientData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNewClientSwitchChange = (checked: boolean, name: string) => {
    // For 'isPublic' or other future switches
    setNewClientData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleNewClientRedirectUrisChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Assuming comma or newline separated URIs
    const uris = e.target.value
      .split(/[\n,]+/)
      .map((uri) => uri.trim())
      .filter((uri) => uri);
    setNewClientData((prev) => ({ ...prev, redirectUris: uris }));
  };

  const handleNewClientScopesChange = (selectedScopes: string[]) => {
    setNewClientData((prev) => ({ ...prev, scopes: selectedScopes }));
  };

  const handleEditClientInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setEditClientData((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  const handleEditClientSwitchChange = (checked: boolean, name: string) => {
    setEditClientData((prev) => (prev ? { ...prev, [name]: checked } : null));
  };

  const handleEditClientRedirectUrisChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const uris = e.target.value
      .split(/[\n,]+/)
      .map((uri) => uri.trim())
      .filter((uri) => uri);
    setEditClientData((prev) => (prev ? { ...prev, redirectUris: uris } : null));
  };

  const handleEditClientScopesChange = (selectedScopes: string[]) => {
    setEditClientData((prev) => (prev ? { ...prev, scopes: selectedScopes } : null));
  };

  const handleAddClientClick = () => {
    setNewClientData({ name: '', description: '', isPublic: false, redirectUris: [], scopes: [] });
    setNewlyCreatedClientSecret(null);
    setIsAddClientModalOpen(true);
  };

  const handleEditClientClick = (client: OAuthClient) => {
    setSelectedClient(client); // Keep original selected client for reference
    setEditClientData({ ...client }); // Clone client data for editing form
    setNewlyCreatedClientSecret(null);
    setIsEditClientModalOpen(true);
  };

  const handleViewClientClick = (client: OAuthClient) => {
    setSelectedClient(client);
    setNewlyCreatedClientSecret(null); // Clear any previous secret
    setIsViewClientModalOpen(true);
  };

  const handleDeleteClientConfirmation = (clientId: string) => {
    if (
      window.confirm(
        'Are you sure you want to delete this OAuth client? This action cannot be undone.'
      )
    ) {
      handleDeleteClient(clientId);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    try {
      // Simulate API: await adminApi.deleteClient(clientId);
      console.log(`Simulating delete for client ID: ${clientId}`);
      alert('OAuth client deleted successfully (Simulated).');
      loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      alert(`Error deleting client: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };

  const handleCreateClient = async () => {
    try {
      // Simulate API: const result = await adminApi.createClient(newClientData);
      console.log('Simulating create client with data:', newClientData);
      const mockResult = {
        ...newClientData,
        id: `client_${Date.now()}`,
        clientId: `mock-client-id-${Date.now()}`,
        clientSecret: !newClientData.isPublic ? `mock-secret-${Date.now()}` : undefined,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      alert('OAuth client created successfully (Simulated).');
      loadClients();
      if (mockResult.clientSecret) {
        setNewlyCreatedClientSecret(mockResult.clientSecret);
        // Keep modal open to show secret, or close and show in toast
      } else {
        setIsAddClientModalOpen(false);
      }
      // Reset form if modal closes:
      // setNewClientData({ name: '', description: '', isPublic: false, redirectUris: [], scopes: [] });
    } catch (error) {
      console.error('Error creating client:', error);
      alert(`Error creating client: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };

  const handleUpdateClient = async () => {
    if (!editClientData) return;
    try {
      // Simulate API: await adminApi.updateClient(editClientData.id, editClientData);
      console.log('Simulating update client with data:', editClientData);
      alert('OAuth client updated successfully (Simulated).');
      loadClients();
      setIsEditClientModalOpen(false);
      setEditClientData(null);
    } catch (error) {
      console.error('Error updating client:', error);
      alert(`Error updating client: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };

  const handleRegenerateClientSecret = async (clientId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to regenerate this client's secret? The current secret will become invalid immediately."
      )
    )
      return;
    try {
      // Simulate API: const result = await adminApi.regenerateClientSecret(clientId);
      const mockNewSecret = `new-mock-secret-${Date.now()}`;
      console.log(
        `Simulating regenerate secret for client ID: ${clientId}. New Secret: ${mockNewSecret}`
      );
      alert(
        `Client secret regenerated successfully (Simulated): ${mockNewSecret}. Please save it now, it won't be shown again.`
      );
      // Update state to display the new secret, perhaps in the edit or view modal if open
      if (isEditClientModalOpen && editClientData && editClientData.id === clientId) {
        setNewlyCreatedClientSecret(mockNewSecret); // Show in edit modal
      } else if (isViewClientModalOpen && selectedClient && selectedClient.id === clientId) {
        setNewlyCreatedClientSecret(mockNewSecret); // Or handle display in view modal
      }
      // No need to reload clients unless backend changes other client data on secret regeneration
    } catch (error) {
      console.error('Error regenerating client secret:', error);
      alert(`Error regenerating client secret: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };
  // --- End OAuth Client Management Handlers ---

  // --- OAuth Scope Management Handlers ---
  const handleNewOAuthScopeInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setNewOAuthScopeData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNewOAuthScopeSwitchChange = (checked: boolean, name: string) => {
    setNewOAuthScopeData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleEditOAuthScopeInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setEditOAuthScopeData((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  const handleEditOAuthScopeSwitchChange = (checked: boolean, name: string) => {
    setEditOAuthScopeData((prev) => (prev ? { ...prev, [name]: checked } : null));
  };

  const handleAddScopeClick = () => {
    setNewOAuthScopeData({ name: '', description: '', isDefault: false, isRestricted: false });
    setIsAddScopeModalOpen(true);
  };

  const handleEditScopeClick = (scope: OAuthScope) => {
    setSelectedOAuthScope(scope);
    setEditOAuthScopeData({ ...scope }); // Clone the scope data for editing
    setIsEditScopeModalOpen(true);
  };

  const handleDeleteOAuthScopeConfirmation = (scopeId: string) => {
    const scope = oauthScopes.find((s) => s.id === scopeId);
    if (scope?.isDefault) {
      alert('Default scopes cannot be deleted.');
      return;
    }
    if (
      window.confirm(
        `Are you sure you want to delete the scope "${scope?.name}"? This might affect existing clients.`
      )
    ) {
      handleDeleteOAuthScope(scopeId);
    }
  };

  const handleDeleteOAuthScope = async (scopeId: string) => {
    try {
      // Simulate API: await adminApi.deleteOAuthScope(scopeId);
      console.log(`Simulating delete for OAuth scope ID: ${scopeId}`);
      alert('OAuth scope deleted successfully (Simulated).');
      loadOAuthScopes(); // Reload scopes
    } catch (error) {
      console.error('Error deleting OAuth scope:', error);
      alert(`Error deleting OAuth scope: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };

  const handleCreateOAuthScope = async () => {
    try {
      // Simulate API: await adminApi.createOAuthScope(newOAuthScopeData);
      console.log('Simulating create OAuth scope with data:', newOAuthScopeData);
      alert('OAuth scope created successfully (Simulated).');
      loadOAuthScopes();
      setIsAddScopeModalOpen(false);
      setNewOAuthScopeData({ name: '', description: '', isDefault: false, isRestricted: false });
    } catch (error) {
      console.error('Error creating OAuth scope:', error);
      alert(`Error creating OAuth scope: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };

  const handleUpdateOAuthScope = async () => {
    if (!editOAuthScopeData) return;
    try {
      // Simulate API: await adminApi.updateOAuthScope(editOAuthScopeData.id, editOAuthScopeData);
      console.log('Simulating update OAuth scope with data:', editOAuthScopeData);
      alert('OAuth scope updated successfully (Simulated).');
      loadOAuthScopes();
      setIsEditScopeModalOpen(false);
      setEditOAuthScopeData(null);
    } catch (error) {
      console.error('Error updating OAuth scope:', error);
      alert(`Error updating OAuth scope: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };
  // --- End OAuth Scope Management Handlers ---

  const handleCreateUser = async () => {
    try {
      // Simulate API Call
      // const createdUser = await adminApi.createUser(newUser); // Actual API call
      console.log('Attempting to create user with data:', newUser);
      // Simulate success:
      alert('User created successfully (Simulated)');
      loadUsers(); // Refresh users list
      setIsAddUserModalOpen(false); // Close modal
      setNewUser({
        // Reset form
        username: '',
        email: '',
        firstName: '',
        lastName: '',
        password: '',
        isActive: true,
      });
    } catch (error) {
      console.error('Error creating user:', error);
      alert(`Error creating user: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await adminApi.getUsers(10);
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadClients = async () => {
    setIsLoadingClients(true);
    try {
      // Simulate API Call: const data = await adminApi.getClients(100); // Fetch more/all
      // Ensure API returns redirectUris (string[]) and scopes (string[])
      const mockClients: OAuthClient[] = [
        {
          id: 'client_1',
          clientId: 'app-xyz-123',
          name: 'Main Frontend App',
          description: 'Primary user-facing application.',
          isPublic: false,
          isActive: true,
          redirectUris: ['https://app.example.com/oauth/callback'],
          scopes: ['openid', 'profile', 'email'],
          createdAt: new Date(Date.now() - 50000000).toISOString(),
        },
        {
          id: 'client_2',
          clientId: 'mobile-abc-789',
          name: 'Mobile App',
          description: 'iOS and Android application.',
          isPublic: false,
          isActive: true,
          redirectUris: ['myapp://oauth/callback'],
          scopes: ['openid', 'profile', 'custom_api:read'],
          createdAt: new Date(Date.now() - 150000000).toISOString(),
        },
        {
          id: 'client_3',
          clientId: 'third-party-svc',
          name: 'Reporting Service',
          description: 'Third-party data analytics.',
          isPublic: true,
          isActive: false,
          redirectUris: ['https://reporter.example.net/cb'],
          scopes: ['custom_api:reports'],
          createdAt: new Date(Date.now() - 250000000).toISOString(),
        },
      ];
      // const data = await adminApi.getClients(10); // Original call
      // setClients(data.clients || []);
      setClients(mockClients);
      console.log('OAuth Clients loaded:', mockClients);
    } catch (error) {
      console.error('Error loading clients:', error);
      setClients([]);
    } finally {
      setIsLoadingClients(false);
      // Note: setIsLoading(false) for general page load is handled in useEffect after all initial loads
    }
  };

  const loadRoles = async () => {
    setIsLoadingRoles(true);
    try {
      // Simulate API Call: const data = await adminApi.getRoles();
      console.log('Fetching roles...');
      // Mock data for roles
      const mockRoles: Role[] = [
        {
          id: 'role_1',
          name: 'Administrator',
          description: 'Full access to all features',
          permissionIds: ['perm_1', 'perm_2', 'perm_3'],
          createdAt: new Date().toISOString(),
        },
        {
          id: 'role_2',
          name: 'Editor',
          description: 'Can edit content',
          permissionIds: ['perm_2'],
          createdAt: new Date().toISOString(),
        },
        {
          id: 'role_3',
          name: 'Viewer',
          description: 'Can only view content',
          permissionIds: ['perm_3'],
          createdAt: new Date().toISOString(),
        },
      ];
      // setRoles(data.roles || []);
      setRoles(mockRoles);
      console.log('Roles loaded:', mockRoles);
    } catch (error) {
      console.error('Error loading roles:', error);
      setRoles([]); // Set to empty array on error
    } finally {
      setIsLoadingRoles(false);
    }
  };

  const loadPermissions = async () => {
    setIsLoadingPermissions(true); // Set loading state for the Permissions tab
    try {
      // Simulate API Call: const data = await adminApi.getPermissions();
      console.log('Fetching permissions for Permission Management Tab...');
      // Mock data for permissions - ensure it includes createdAt for view modal
      const mockPermissionsData: Permission[] = [
        {
          id: 'perm_1',
          name: 'manage_users',
          description: 'Allows creating, reading, updating, and deleting users.',
          createdAt: new Date(Date.now() - 100000000).toISOString(),
        },
        {
          id: 'perm_2',
          name: 'edit_content',
          description: 'Allows creating, editing, and deleting website content.',
          createdAt: new Date(Date.now() - 200000000).toISOString(),
        },
        {
          id: 'perm_3',
          name: 'view_content',
          description: 'Allows viewing website content.',
          createdAt: new Date(Date.now() - 300000000).toISOString(),
        },
        {
          id: 'perm_4',
          name: 'manage_settings',
          description: 'Allows accessing and modifying system settings.',
          createdAt: new Date(Date.now() - 400000000).toISOString(),
        },
        {
          id: 'perm_5',
          name: 'publish_articles',
          description: 'Allows users to publish articles.',
          createdAt: new Date(Date.now() - 500000000).toISOString(),
        },
      ];
      setPermissions(mockPermissionsData); // This state is already used by Roles for MultiSelect
      console.log('Permissions loaded and available for Permission Tab:', mockPermissionsData);
    } catch (error) {
      console.error('Error loading permissions:', error);
      setPermissions([]);
    } finally {
      setIsLoadingPermissions(false); // Clear loading state for the Permissions tab
    }
  };

  const loadOAuthScopes = async () => {
    setIsLoadingOAuthScopes(true);
    try {
      // Simulate API Call: const data = await adminApi.getOAuthScopes();
      console.log('Fetching OAuth scopes for management...');
      const mockOAuthScopesData: OAuthScope[] = [
        {
          id: 'scope_1',
          name: 'openid',
          description: 'OpenID Connect standard scope for authentication.',
          isDefault: true,
          isRestricted: false,
          createdAt: new Date(Date.now() - 600000000).toISOString(),
        },
        {
          id: 'scope_2',
          name: 'profile',
          description: "Access to user's default profile information.",
          isDefault: true,
          isRestricted: false,
          createdAt: new Date(Date.now() - 550000000).toISOString(),
        },
        {
          id: 'scope_3',
          name: 'email',
          description: "Access to user's email address.",
          isDefault: true,
          isRestricted: false,
          createdAt: new Date(Date.now() - 500000000).toISOString(),
        },
        {
          id: 'scope_4',
          name: 'custom_api:read',
          description: 'Read access to custom API resources.',
          isDefault: false,
          isRestricted: false,
          createdAt: new Date(Date.now() - 450000000).toISOString(),
        },
        {
          id: 'scope_5',
          name: 'custom_api:write',
          description: 'Write access to custom API resources.',
          isDefault: false,
          isRestricted: false,
          createdAt: new Date(Date.now() - 400000000).toISOString(),
        },
        {
          id: 'scope_6',
          name: 'admin',
          description: 'Administrative privileges for the system.',
          isDefault: false,
          isRestricted: true,
          createdAt: new Date(Date.now() - 350000000).toISOString(),
        },
      ];
      setOAuthScopes(mockOAuthScopesData);
      console.log('OAuth Scopes loaded for management:', mockOAuthScopesData);
    } catch (error) {
      console.error('Error loading OAuth scopes:', error);
      setOAuthScopes([]);
    } finally {
      setIsLoadingOAuthScopes(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      sessionStorage.removeItem('access_token');
      sessionStorage.removeItem('refresh_token');
      router.push('/login');
    }
  };

  const handleAddUserClick = () => {
    setNewUser({
      username: '',
      email: '',
      firstName: '',
      lastName: '',
      password: '',
      isActive: true,
    });
    setIsAddUserModalOpen(true);
  };

  const handleEditUserClick = (user: User) => {
    setSelectedUser(user);
    setIsEditUserModalOpen(true);
  };

  const handleViewUserClick = (user: User) => {
    setSelectedUser(user);
    setIsViewUserModalOpen(true);
  };

  const handleDeleteUserConfirmation = (userId: string) => {
    // TODO: Implement actual deletion logic, perhaps with a confirmation modal
    if (window.confirm('Are you sure you want to delete this user?')) {
      handleDeleteUser(userId);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      // Simulate API Call
      // await adminApi.deleteUser(userId); // Actual API call
      console.log(`Attempting to delete user with ID: ${userId}`);
      // Simulate success
      alert('User deleted successfully (Simulated)');
      loadUsers(); // Refresh user list
    } catch (error) {
      console.error('Error deleting user:', error);
      alert(`Error deleting user: ${error.message || 'Unknown error'} (Simulated)`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">OAuth 2.0 Admin Center</h1>
              <p className="text-sm text-gray-600">
                Welcome, {userInfo?.name || userInfo?.preferred_username}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="flex items-center space-x-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Users</span>
            </TabsTrigger>
            <TabsTrigger value="clients" className="flex items-center space-x-2">
              <Key className="h-4 w-4" />
              <span>Clients</span>
            </TabsTrigger>
            <TabsTrigger value="permissions" className="flex items-center space-x-2">
              <Shield className="h-4 w-4" />
              <span>Permissions</span>
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center space-x-2">
              <Users2 className="h-4 w-4" />
              <span>Roles</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{users.length}</div>
                  <p className="text-xs text-muted-foreground">Active registered users</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">OAuth Clients</CardTitle>
                  <Key className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{clients.length}</div>
                  <p className="text-xs text-muted-foreground">Registered OAuth applications</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Security Status</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">Secure</div>
                  <p className="text-xs text-muted-foreground">All systems operational</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common administrative tasks</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  className="flex items-center space-x-2 h-auto p-4"
                  onClick={() => setActiveTab('users')}
                >
                  <Users className="h-5 w-5" />
                  <span>Manage Users</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center space-x-2 h-auto p-4"
                  onClick={() => setActiveTab('clients')}
                >
                  <Key className="h-5 w-5" />
                  <span>OAuth Clients</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center space-x-2 h-auto p-4"
                  onClick={() => setActiveTab('permissions')}
                >
                  <Shield className="h-5 w-5" />
                  <span>Permissions</span>
                </Button>
                <Button variant="outline" className="flex items-center space-x-2 h-auto p-4">
                  <Settings className="h-5 w-5" />
                  <span>Settings</span>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
                <p className="text-gray-600">Manage user accounts and permissions</p>
              </div>
              <Button className="flex items-center space-x-2" onClick={handleAddUserClick}>
                <Plus className="h-4 w-4" />
                <span>Add User</span>
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Users</CardTitle>
                <CardDescription>List of registered users</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                          <h3 className="font-medium">
                            {user.firstName} {user.lastName}
                          </h3>
                          <p className="text-sm text-gray-600">@{user.username}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={user.isActive ? 'default' : 'secondary'}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => handleViewUserClick(user)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEditUserClick(user)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteUserConfirmation(user.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Clients Tab */}
          <TabsContent value="clients" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">OAuth Client Management</h2>
                <p className="text-gray-600">Manage OAuth 2.0 client applications</p>
              </div>
              <Button className="flex items-center space-x-2" onClick={handleAddClientClick}>
                <Plus className="h-4 w-4" />
                <span>Add Client</span>
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>OAuth Clients</CardTitle>
                <CardDescription>Registered OAuth 2.0 applications</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingClients ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <p className="ml-2 text-gray-600">Loading clients...</p>
                  </div>
                ) : clients.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">No OAuth clients found.</p>
                ) : (
                  <div className="space-y-4">
                    {clients.map((client) => (
                      <div
                        key={client.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex items-center space-x-4 flex-1 min-w-0">
                          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                            <Key className="h-5 w-5 text-green-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium truncate" title={client.name}>
                              {client.name}
                            </h3>
                            <p className="text-sm text-gray-600 truncate" title={client.clientId}>
                              {client.clientId}
                            </p>
                            <p
                              className="text-sm text-gray-500 truncate"
                              title={client.description}
                            >
                              {client.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1 ml-2">
                          <Badge
                            variant={client.isPublic ? 'secondary' : 'default'}
                            className="hidden sm:inline-flex"
                          >
                            {client.isPublic ? 'Public' : 'Confidential'}
                          </Badge>
                          <Badge
                            variant={client.isActive ? 'default' : 'secondary'}
                            className="hidden sm:inline-flex"
                          >
                            {client.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleViewClientClick(client)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditClientClick(client)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDeleteClientConfirmation(client.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Permissions Tab */}
          <TabsContent value="permissions" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Permission Management</h2>
                <p className="text-gray-600">Manage user permissions and access control</p>
              </div>
              <Button className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>Grant Permission</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Enhanced Card for Available OAuth Scopes */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle>Available OAuth Scopes</CardTitle>
                    <CardDescription>Manage system-wide OAuth 2.0 scopes</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddScopeClick}
                    className="flex items-center space-x-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Scope</span>
                  </Button>
                </CardHeader>
                <CardContent>
                  {isLoadingOAuthScopes ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                      <p className="ml-2 text-gray-500">Loading scopes...</p>
                    </div>
                  ) : oauthScopes.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No OAuth scopes defined.</p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {oauthScopes.map((scope) => (
                        <div
                          key={scope.id}
                          className="flex items-start justify-between p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex-1 min-w-0 mr-2">
                            <h4 className="font-medium text-sm truncate" title={scope.name}>
                              {scope.name}
                            </h4>
                            <p className="text-xs text-gray-500" title={scope.description}>
                              {scope.description || 'No description.'}
                            </p>
                            <div className="mt-1">
                              {scope.isDefault && (
                                <Badge variant="outline" className="mr-1 text-xs">
                                  Default
                                </Badge>
                              )}
                              {scope.isRestricted && (
                                <Badge variant="destructive" className="text-xs">
                                  Restricted
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditScopeClick(scope)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {!scope.isDefault && ( // Prevent deleting default scopes
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleDeleteOAuthScopeConfirmation(scope.id)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Enhanced Card for Managing Application Permissions */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle>Application Permissions</CardTitle>
                    <CardDescription>Define and manage system-wide permissions</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddPermissionClick}
                    className="flex items-center space-x-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Permission</span>
                  </Button>
                </CardHeader>
                <CardContent>
                  {isLoadingPermissions ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                      <p className="ml-2 text-gray-500">Loading permissions...</p>
                    </div>
                  ) : permissions.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No permissions defined.</p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {' '}
                      {/* Added scroll for long lists */}
                      {permissions.map((permission) => (
                        <div
                          key={permission.id}
                          className="flex items-center justify-between p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            {' '}
                            {/* Flex properties for truncation */}
                            <h4 className="font-medium text-sm truncate" title={permission.name}>
                              {permission.name}
                            </h4>
                            <p
                              className="text-xs text-gray-500 truncate"
                              title={permission.description}
                            >
                              {permission.description || 'No description provided.'}
                            </p>
                          </div>
                          <div className="flex items-center space-x-1 ml-2">
                            {' '}
                            {/* Added margin */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleViewPermissionClick(permission)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditPermissionClick(permission)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDeletePermissionConfirmation(permission.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Add User Modal */}
        <Dialog open={isAddUserModalOpen} onOpenChange={setIsAddUserModalOpen}>
          <DialogContent className="sm:max-w-[475px]">
            {' '}
            {/* Increased width slightly */}
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>
                Fill in the details below to create a new user account. Click submit to save.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="username-add" className="text-right">
                  Username
                </Label>
                <Input
                  id="username-add"
                  name="username"
                  value={newUser.username}
                  onChange={handleNewUserInputChange}
                  className="col-span-3"
                  placeholder="Enter username"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email-add" className="text-right">
                  Email
                </Label>
                <Input
                  id="email-add"
                  name="email"
                  type="email"
                  value={newUser.email}
                  onChange={handleNewUserInputChange}
                  className="col-span-3"
                  placeholder="user@example.com"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="firstName-add" className="text-right">
                  First Name
                </Label>
                <Input
                  id="firstName-add"
                  name="firstName"
                  value={newUser.firstName}
                  onChange={handleNewUserInputChange}
                  className="col-span-3"
                  placeholder="John"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="lastName-add" className="text-right">
                  Last Name
                </Label>
                <Input
                  id="lastName-add"
                  name="lastName"
                  value={newUser.lastName}
                  onChange={handleNewUserInputChange}
                  className="col-span-3"
                  placeholder="Doe"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="password-add" className="text-right">
                  Password
                </Label>
                <Input
                  id="password-add"
                  name="password"
                  type="password"
                  value={newUser.password}
                  onChange={handleNewUserInputChange}
                  className="col-span-3"
                  placeholder="••••••••"
                />
              </div>
              <div className="flex items-center space-x-2 justify-end mt-2 pr-4">
                {' '}
                {/* Adjusted for alignment */}
                <Label htmlFor="isActive-add" className="">
                  {' '}
                  {/* Removed text-right */}
                  Active
                </Label>
                <Switch
                  id="isActive-add"
                  checked={newUser.isActive}
                  onCheckedChange={handleNewUserSwitchChange}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" onClick={handleCreateUser}>
                Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Modal */}
        <Dialog open={isEditUserModalOpen} onOpenChange={setIsEditUserModalOpen}>
          <DialogContent className="sm:max-w-[475px]">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Modify the user details below. Click save to apply changes.
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="username-edit" className="text-right">
                    Username
                  </Label>
                  <Input
                    id="username-edit"
                    name="username"
                    value={selectedUser.username}
                    readOnly // Username is typically not editable
                    className="col-span-3 bg-gray-100"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="email-edit" className="text-right">
                    Email
                  </Label>
                  <Input
                    id="email-edit"
                    name="email"
                    type="email"
                    value={selectedUser.email}
                    onChange={handleSelectedUserInputChange}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="firstName-edit" className="text-right">
                    First Name
                  </Label>
                  <Input
                    id="firstName-edit"
                    name="firstName"
                    value={selectedUser.firstName}
                    onChange={handleSelectedUserInputChange}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="lastName-edit" className="text-right">
                    Last Name
                  </Label>
                  <Input
                    id="lastName-edit"
                    name="lastName"
                    value={selectedUser.lastName}
                    onChange={handleSelectedUserInputChange}
                    className="col-span-3"
                  />
                </div>
                <div className="flex items-center space-x-2 justify-end mt-2 pr-4">
                  <Label htmlFor="isActive-edit" className="">
                    Active
                  </Label>
                  <Switch
                    id="isActive-edit"
                    checked={selectedUser.isActive}
                    onCheckedChange={handleSelectedUserSwitchChange}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditUserModalOpen(false)}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" onClick={handleUpdateUser}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View User Modal */}
        <Dialog open={isViewUserModalOpen} onOpenChange={setIsViewUserModalOpen}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle>View User Details</DialogTitle>
              <DialogDescription>Detailed information for the selected user.</DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="grid gap-3 py-4 px-2">
                {' '}
                {/* Added some padding */}
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">User ID:</span>
                  <span className="text-sm text-gray-900">{selectedUser.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Username:</span>
                  <span className="text-sm text-gray-900">{selectedUser.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Email:</span>
                  <span className="text-sm text-gray-900">{selectedUser.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">First Name:</span>
                  <span className="text-sm text-gray-900">{selectedUser.firstName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Last Name:</span>
                  <span className="text-sm text-gray-900">{selectedUser.lastName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Status:</span>
                  <Badge variant={selectedUser.isActive ? 'default' : 'secondary'}>
                    {selectedUser.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Created At:</span>
                  <span className="text-sm text-gray-900">
                    {new Date(selectedUser.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {/* Add roles display here later if available */}
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" onClick={() => setIsViewUserModalOpen(false)}>
                  Close
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Role Modal */}
        <Dialog open={isAddRoleModalOpen} onOpenChange={setIsAddRoleModalOpen}>
          <DialogContent className="sm:max-w-lg">
            {' '}
            {/* Wider for permissions */}
            <DialogHeader>
              <DialogTitle>Add New Role</DialogTitle>
              <DialogDescription>Define a new role and select its permissions.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="roleName-add" className="text-right">
                  Role Name
                </Label>
                <Input
                  id="roleName-add"
                  name="name"
                  value={newRoleData.name}
                  onChange={handleNewRoleInputChange}
                  className="col-span-3"
                  placeholder="e.g., Contributor"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                {' '}
                {/* items-start for textarea alignment */}
                <Label htmlFor="roleDescription-add" className="text-right pt-1">
                  {' '}
                  {/* Adjust label alignment */}
                  Description
                </Label>
                <Textarea
                  id="roleDescription-add"
                  name="description"
                  value={newRoleData.description}
                  onChange={handleNewRoleInputChange}
                  className="col-span-3"
                  placeholder="Briefly describe this role"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="rolePermissions-add" className="text-right pt-1">
                  Permissions
                </Label>
                <div className="col-span-3">
                  <MultiSelect
                    options={
                      permissions.map((p) => ({
                        value: p.id,
                        label: `${p.name} (${p.description || 'No description'})`,
                      })) as MultiSelectOption[]
                    }
                    selectedValues={newRoleData.permissionIds}
                    onChange={handleNewRolePermissionsChange}
                    placeholder="Select permissions..."
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Select one or more permissions for this role.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddRoleModalOpen(false)}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" onClick={handleCreateRole}>
                Create Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Role Modal */}
        <Dialog open={isEditRoleModalOpen} onOpenChange={setIsEditRoleModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Role</DialogTitle>
              <DialogDescription>
                Modify the role details and assigned permissions.
              </DialogDescription>
            </DialogHeader>
            {editRoleData && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="roleName-edit" className="text-right">
                    Role Name
                  </Label>
                  <Input
                    id="roleName-edit"
                    name="name"
                    value={editRoleData.name}
                    onChange={handleEditRoleInputChange}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="roleDescription-edit" className="text-right pt-1">
                    Description
                  </Label>
                  <Textarea
                    id="roleDescription-edit"
                    name="description"
                    value={editRoleData.description}
                    onChange={handleEditRoleInputChange}
                    className="col-span-3"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="rolePermissions-edit" className="text-right pt-1">
                    Permissions
                  </Label>
                  <div className="col-span-3">
                    <MultiSelect
                      options={
                        permissions.map((p) => ({
                          value: p.id,
                          label: `${p.name} (${p.description || 'No description'})`,
                        })) as MultiSelectOption[]
                      }
                      selectedValues={editRoleData.permissionIds}
                      onChange={handleEditRolePermissionsChange}
                      placeholder="Select permissions..."
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Select one or more permissions for this role.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditRoleModalOpen(false)}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" onClick={handleUpdateRole}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Permission Modal */}
        <Dialog open={isAddPermissionModalOpen} onOpenChange={setIsAddPermissionModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Permission</DialogTitle>
              <DialogDescription>
                Define a new permission for use in roles. Name should be unique (e.g., user:create).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="permissionName-add" className="text-right">
                  Name
                </Label>
                <Input
                  id="permissionName-add"
                  name="name"
                  value={newPermissionData.name}
                  onChange={handleNewPermissionInputChange}
                  className="col-span-3"
                  placeholder="e.g., article:publish"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="permissionDescription-add" className="text-right pt-1">
                  Description
                </Label>
                <Textarea
                  id="permissionDescription-add"
                  name="description"
                  value={newPermissionData.description}
                  onChange={handleNewPermissionInputChange}
                  className="col-span-3"
                  placeholder="Describe what this permission allows"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddPermissionModalOpen(false)}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" onClick={handleCreatePermission}>
                Create Permission
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Permission Modal */}
        <Dialog open={isEditPermissionModalOpen} onOpenChange={setIsEditPermissionModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Permission</DialogTitle>
              <DialogDescription>
                Update the permission details. The name might be read-only if it's a system key.
              </DialogDescription>
            </DialogHeader>
            {editPermissionData && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="permissionName-edit" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="permissionName-edit"
                    name="name"
                    value={editPermissionData.name}
                    onChange={handleEditPermissionInputChange}
                    className="col-span-3"
                    readOnly // Assuming name is a key and should not be changed easily
                  />
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="permissionDescription-edit" className="text-right pt-1">
                    Description
                  </Label>
                  <Textarea
                    id="permissionDescription-edit"
                    name="description"
                    value={editPermissionData.description}
                    onChange={handleEditPermissionInputChange}
                    className="col-span-3"
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditPermissionModalOpen(false)}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" onClick={handleUpdatePermission}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Permission Modal */}
        <Dialog open={isViewPermissionModalOpen} onOpenChange={setIsViewPermissionModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>View Permission Details</DialogTitle>
              <DialogDescription>
                Detailed information for the selected permission.
              </DialogDescription>
            </DialogHeader>
            {selectedPermission && (
              <div className="space-y-3 py-4">
                <div>
                  <Label
                    htmlFor="permissionName-view"
                    className="text-sm font-medium text-gray-500"
                  >
                    Name
                  </Label>
                  <p id="permissionName-view" className="text-sm text-gray-900 mt-1">
                    {selectedPermission.name}
                  </p>
                </div>
                <div>
                  <Label
                    htmlFor="permissionDescription-view"
                    className="text-sm font-medium text-gray-500"
                  >
                    Description
                  </Label>
                  <p
                    id="permissionDescription-view"
                    className="text-sm text-gray-900 mt-1 whitespace-pre-wrap"
                  >
                    {selectedPermission.description || 'N/A'}
                  </p>
                </div>
                {selectedPermission.createdAt && (
                  <div>
                    <Label
                      htmlFor="permissionCreatedAt-view"
                      className="text-sm font-medium text-gray-500"
                    >
                      Created At
                    </Label>
                    <p id="permissionCreatedAt-view" className="text-sm text-gray-900 mt-1">
                      {new Date(selectedPermission.createdAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" onClick={() => setIsViewPermissionModalOpen(false)}>
                  Close
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add OAuth Client Modal */}
        <Dialog
          open={isAddClientModalOpen}
          onOpenChange={(isOpen) => {
            setIsAddClientModalOpen(isOpen);
            if (!isOpen) setNewlyCreatedClientSecret(null); // Clear secret when modal closes
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New OAuth Client</DialogTitle>
              <DialogDescription>Configure a new OAuth 2.0 client application.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="clientName-add" className="text-right">
                  Name
                </Label>
                <Input
                  id="clientName-add"
                  name="name"
                  value={newClientData.name}
                  onChange={handleNewClientInputChange}
                  className="col-span-3"
                  placeholder="My Awesome App"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="clientDescription-add" className="text-right pt-1">
                  Description
                </Label>
                <Textarea
                  id="clientDescription-add"
                  name="description"
                  value={newClientData.description}
                  onChange={handleNewClientInputChange}
                  className="col-span-3"
                  placeholder="Brief description of the client"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="clientIsPublic-add" className="text-right">
                  Client Type
                </Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <Switch
                    id="clientIsPublic-add"
                    name="isPublic"
                    checked={newClientData.isPublic}
                    onCheckedChange={(checked) => handleNewClientSwitchChange(checked, 'isPublic')}
                  />
                  <span className="text-sm">
                    {newClientData.isPublic ? 'Public' : 'Confidential'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="clientRedirectUris-add" className="text-right pt-1">
                  Redirect URIs
                </Label>
                <Textarea
                  id="clientRedirectUris-add"
                  name="redirectUris"
                  value={newClientData.redirectUris.join('\n')}
                  onChange={handleNewClientRedirectUrisChange}
                  className="col-span-3"
                  placeholder="https://app.example.com/callback&#10;myapp://callback"
                  rows={3}
                />
                <p className="col-span-3 col-start-2 text-xs text-muted-foreground">
                  Enter one URI per line or comma-separated.
                </p>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="clientScopes-add" className="text-right pt-1">
                  Scopes
                </Label>
                <div className="col-span-3">
                  <MultiSelect
                    options={
                      oauthScopes.map((s) => ({
                        value: s.name,
                        label: `${s.name} (${s.description || 'N/A'})`,
                      })) as MultiSelectOption[]
                    }
                    selectedValues={newClientData.scopes}
                    onChange={handleNewClientScopesChange}
                    placeholder="Select scopes..."
                    className="w-full"
                  />
                </div>
              </div>

              {newlyCreatedClientSecret && !newClientData.isPublic && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                  <Label className="font-semibold text-green-700">
                    Client Secret (Save Securely!)
                  </Label>
                  <p className="text-sm text-green-600 break-all bg-white p-2 rounded mt-1">
                    {newlyCreatedClientSecret}
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    This secret will not be shown again. Copy and store it securely.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddClientModalOpen(false);
                    setNewlyCreatedClientSecret(null);
                  }}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                onClick={handleCreateClient}
                disabled={!!newlyCreatedClientSecret && !newClientData.isPublic}
              >
                {newlyCreatedClientSecret && !newClientData.isPublic
                  ? 'Client Created'
                  : 'Create Client'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit OAuth Client Modal */}
        <Dialog
          open={isEditClientModalOpen}
          onOpenChange={(isOpen) => {
            setIsEditClientModalOpen(isOpen);
            if (!isOpen) {
              setNewlyCreatedClientSecret(null); // Clear any displayed secret
              setEditClientData(null); // Clear edit data
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit OAuth Client</DialogTitle>
              <DialogDescription>
                Modify the client details below. Client ID and Type are read-only.
              </DialogDescription>
            </DialogHeader>
            {editClientData && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="clientId-edit" className="text-right">
                    Client ID
                  </Label>
                  <Input
                    id="clientId-edit"
                    value={editClientData.clientId}
                    readOnly
                    className="col-span-3 bg-gray-100"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="clientName-edit" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="clientName-edit"
                    name="name"
                    value={editClientData.name}
                    onChange={handleEditClientInputChange}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="clientDescription-edit" className="text-right pt-1">
                    Description
                  </Label>
                  <Textarea
                    id="clientDescription-edit"
                    name="description"
                    value={editClientData.description}
                    onChange={handleEditClientInputChange}
                    className="col-span-3"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="clientIsPublic-edit" className="text-right">
                    Client Type
                  </Label>
                  <Input
                    id="clientIsPublic-edit"
                    value={editClientData.isPublic ? 'Public' : 'Confidential'}
                    readOnly
                    className="col-span-3 bg-gray-100"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="clientIsActive-edit" className="text-right">
                    Status
                  </Label>
                  <div className="col-span-3 flex items-center space-x-2">
                    <Switch
                      id="clientIsActive-edit"
                      name="isActive"
                      checked={editClientData.isActive}
                      onCheckedChange={(checked) =>
                        handleEditClientSwitchChange(checked, 'isActive')
                      }
                    />
                    <span className="text-sm">
                      {editClientData.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="clientRedirectUris-edit" className="text-right pt-1">
                    Redirect URIs
                  </Label>
                  <Textarea
                    id="clientRedirectUris-edit"
                    name="redirectUris"
                    value={editClientData.redirectUris.join('\n')}
                    onChange={handleEditClientRedirectUrisChange}
                    className="col-span-3"
                    rows={3}
                  />
                  <p className="col-span-3 col-start-2 text-xs text-muted-foreground">
                    Enter one URI per line or comma-separated.
                  </p>
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="clientScopes-edit" className="text-right pt-1">
                    Scopes
                  </Label>
                  <div className="col-span-3">
                    <MultiSelect
                      options={
                        oauthScopes.map((s) => ({
                          value: s.name,
                          label: `${s.name} (${s.description || 'N/A'})`,
                        })) as MultiSelectOption[]
                      }
                      selectedValues={editClientData.scopes}
                      onChange={handleEditClientScopesChange}
                      placeholder="Select scopes..."
                      className="w-full"
                    />
                  </div>
                </div>

                {!editClientData.isPublic && (
                  <div className="col-span-4">
                    <Label className="text-sm font-medium">Client Secret</Label>
                    {newlyCreatedClientSecret ? (
                      <div className="mt-1 p-3 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm text-green-600 break-all bg-white p-2 rounded">
                          {newlyCreatedClientSecret}
                        </p>
                        <p className="text-xs text-yellow-700 mt-1">
                          This new secret is shown once. Copy and store it securely.
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">
                        Secret is hidden. Regenerate to get a new one.
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => handleRegenerateClientSecret(editClientData.id)}
                    >
                      Regenerate Secret
                    </Button>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditClientModalOpen(false);
                    setNewlyCreatedClientSecret(null);
                    setEditClientData(null);
                  }}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" onClick={handleUpdateClient}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View OAuth Client Modal */}
        <Dialog
          open={isViewClientModalOpen}
          onOpenChange={(isOpen) => {
            setIsViewClientModalOpen(isOpen);
            if (!isOpen) setNewlyCreatedClientSecret(null); // Clear secret when modal closes
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>View OAuth Client Details</DialogTitle>
              <DialogDescription>
                Detailed information for the selected OAuth client.
              </DialogDescription>
            </DialogHeader>
            {selectedClient && (
              <div className="space-y-3 py-4">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm font-medium text-gray-500">Name:</span>
                  <span className="text-sm text-gray-900">{selectedClient.name}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm font-medium text-gray-500">Client ID:</span>
                  <span className="text-sm text-gray-900">{selectedClient.clientId}</span>
                </div>
                <div className="border-b pb-2">
                  <span className="text-sm font-medium text-gray-500">Description:</span>
                  <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">
                    {selectedClient.description || 'N/A'}
                  </p>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm font-medium text-gray-500">Client Type:</span>
                  <span className="text-sm text-gray-900">
                    {selectedClient.isPublic ? 'Public' : 'Confidential'}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm font-medium text-gray-500">Status:</span>
                  <Badge variant={selectedClient.isActive ? 'default' : 'secondary'}>
                    {selectedClient.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="border-b pb-2">
                  <span className="text-sm font-medium text-gray-500">Redirect URIs:</span>
                  {selectedClient.redirectUris.length > 0 ? (
                    <ul className="list-disc list-inside pl-2 mt-1">
                      {selectedClient.redirectUris.map((uri, idx) => (
                        <li key={idx} className="text-sm text-gray-700 break-all">
                          {uri}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 mt-1">No redirect URIs configured.</p>
                  )}
                </div>
                <div className="border-b pb-2">
                  <span className="text-sm font-medium text-gray-500">Assigned Scopes:</span>
                  {selectedClient.scopes.length > 0 ? (
                    <ul className="list-disc list-inside pl-2 mt-1">
                      {selectedClient.scopes.map((scopeName) => {
                        const scopeDetail = oauthScopes.find((s) => s.name === scopeName);
                        return (
                          <li key={scopeName} className="text-sm text-gray-700">
                            {scopeDetail
                              ? `${scopeDetail.name} (${scopeDetail.description || 'N/A'})`
                              : scopeName}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 mt-1">No scopes assigned.</p>
                  )}
                </div>
                {!selectedClient.isPublic && (
                  <div className="border-b pb-2">
                    <span className="text-sm font-medium text-gray-500">Client Secret:</span>
                    {newlyCreatedClientSecret ? (
                      <div className="mt-1 p-3 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm text-green-600 break-all bg-white p-2 rounded">
                          {newlyCreatedClientSecret}
                        </p>
                        <p className="text-xs text-yellow-700 mt-1">
                          This new secret is shown once. Copy and store it securely.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600 mt-1">
                        &lt;Hidden&gt; - Regenerate to view a new secret.
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => handleRegenerateClientSecret(selectedClient.id)}
                    >
                      Regenerate Secret
                    </Button>
                  </div>
                )}
                {selectedClient.createdAt && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500">Created At:</span>
                    <span className="text-sm text-gray-900">
                      {new Date(selectedClient.createdAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  onClick={() => {
                    setIsViewClientModalOpen(false);
                    setNewlyCreatedClientSecret(null);
                  }}
                >
                  Close
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add OAuth Scope Modal */}
        <Dialog open={isAddScopeModalOpen} onOpenChange={setIsAddScopeModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New OAuth Scope</DialogTitle>
              <DialogDescription>
                Define a new OAuth scope for client applications.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="scopeName-add" className="text-right">
                  Name
                </Label>
                <Input
                  id="scopeName-add"
                  name="name"
                  value={newOAuthScopeData.name}
                  onChange={handleNewOAuthScopeInputChange}
                  className="col-span-3"
                  placeholder="e.g., chat:read"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="scopeDescription-add" className="text-right pt-1">
                  Description
                </Label>
                <Textarea
                  id="scopeDescription-add"
                  name="description"
                  value={newOAuthScopeData.description}
                  onChange={handleNewOAuthScopeInputChange}
                  className="col-span-3"
                  placeholder="Describe what this scope allows"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="scopeIsDefault-add" className="text-right">
                  Default
                </Label>
                <div className="col-span-3">
                  <Switch
                    id="scopeIsDefault-add"
                    name="isDefault"
                    checked={newOAuthScopeData.isDefault}
                    onCheckedChange={(checked) =>
                      handleNewOAuthScopeSwitchChange(checked, 'isDefault')
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Assign by default to new clients (if applicable).
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="scopeIsRestricted-add" className="text-right">
                  Restricted
                </Label>
                <div className="col-span-3">
                  <Switch
                    id="scopeIsRestricted-add"
                    name="isRestricted"
                    checked={newOAuthScopeData.isRestricted}
                    onCheckedChange={(checked) =>
                      handleNewOAuthScopeSwitchChange(checked, 'isRestricted')
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Requires special approval or admin only.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddScopeModalOpen(false)}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" onClick={handleCreateOAuthScope}>
                Create Scope
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit OAuth Scope Modal */}
        <Dialog open={isEditScopeModalOpen} onOpenChange={setIsEditScopeModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit OAuth Scope</DialogTitle>
              <DialogDescription>
                Update the details for the OAuth scope. Name might be read-only.
              </DialogDescription>
            </DialogHeader>
            {editOAuthScopeData && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="scopeName-edit" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="scopeName-edit"
                    name="name"
                    value={editOAuthScopeData.name}
                    onChange={handleEditOAuthScopeInputChange}
                    className="col-span-3 bg-gray-100"
                    readOnly
                  />
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="scopeDescription-edit" className="text-right pt-1">
                    Description
                  </Label>
                  <Textarea
                    id="scopeDescription-edit"
                    name="description"
                    value={editOAuthScopeData.description}
                    onChange={handleEditOAuthScopeInputChange}
                    className="col-span-3"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="scopeIsDefault-edit" className="text-right">
                    Default
                  </Label>
                  <div className="col-span-3">
                    <Switch
                      id="scopeIsDefault-edit"
                      name="isDefault"
                      checked={editOAuthScopeData.isDefault}
                      onCheckedChange={(checked) =>
                        handleEditOAuthScopeSwitchChange(checked, 'isDefault')
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Assign by default to new clients (if applicable).
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="scopeIsRestricted-edit" className="text-right">
                    Restricted
                  </Label>
                  <div className="col-span-3">
                    <Switch
                      id="scopeIsRestricted-edit"
                      name="isRestricted"
                      checked={editOAuthScopeData.isRestricted}
                      onCheckedChange={(checked) =>
                        handleEditOAuthScopeSwitchChange(checked, 'isRestricted')
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Requires special approval or admin only.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditScopeModalOpen(false)}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" onClick={handleUpdateOAuthScope}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Role Modal */}
        <Dialog open={isViewRoleModalOpen} onOpenChange={setIsViewRoleModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>View Role Details</DialogTitle>
              <DialogDescription>
                Information for the selected role and its permissions.
              </DialogDescription>
            </DialogHeader>
            {selectedRole && (
              <div className="space-y-4 py-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">Role Name</h4>
                  <p className="text-sm text-gray-900">{selectedRole.name}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">Description</h4>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">
                    {selectedRole.description || 'N/A'}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">Permissions</h4>
                  {selectedRole.permissionIds && selectedRole.permissionIds.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1">
                      {selectedRole.permissionIds.map((pid) => {
                        const perm = permissions.find((p) => p.id === pid);
                        return (
                          <li key={pid} className="text-sm text-gray-700">
                            {perm ? perm.name : `Unknown permission (ID: ${pid})`}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No permissions assigned to this role.</p>
                  )}
                </div>
                {selectedRole.createdAt && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Created At</h4>
                    <p className="text-sm text-gray-900">
                      {new Date(selectedRole.createdAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" onClick={() => setIsViewRoleModalOpen(false)}>
                  Close
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Roles Tab Content */}
        <TabsContent value="roles" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Role Management</h2>
              <p className="text-gray-600">Define roles and assign permissions</p>
            </div>
            <Button className="flex items-center space-x-2" onClick={handleAddRoleClick}>
              <Plus className="h-4 w-4" />
              <span>Add Role</span>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Roles</CardTitle>
              <CardDescription>List of defined roles</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingRoles ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  <p className="ml-2 text-gray-600">Loading roles...</p>
                </div>
              ) : roles.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No roles found.</p>
              ) : (
                <div className="space-y-4">
                  {roles.map((role) => (
                    <div
                      key={role.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                          <Users2 className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <h3 className="font-medium">{role.name}</h3>
                          <p className="text-sm text-gray-600">{role.description}</p>
                          <p className="text-xs text-gray-400">ID: {role.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => handleViewRoleClick(role)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEditRoleClick(role)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRoleConfirmation(role.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </main>
    </div>
  );
}
