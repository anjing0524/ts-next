"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Trash2
} from 'lucide-react';
import { authApi, adminApi } from '@/lib/api';

interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
}

interface Client {
  id: string;
  clientId: string;
  name: string;
  description: string;
  isPublic: boolean;
  isActive: boolean;
  createdAt: string;
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
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadUserInfo();
    loadUsers();
    loadClients();
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

  const loadUsers = async () => {
    try {
      const data = await adminApi.getUsers(10);
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadClients = async () => {
    try {
      const data = await adminApi.getClients(10);
      setClients(data.clients || []);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setIsLoading(false);
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
                  <p className="text-xs text-muted-foreground">
                    Active registered users
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">OAuth Clients</CardTitle>
                  <Key className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{clients.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Registered OAuth applications
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Security Status</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">Secure</div>
                  <p className="text-xs text-muted-foreground">
                    All systems operational
                  </p>
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
                <Button 
                  variant="outline" 
                  className="flex items-center space-x-2 h-auto p-4"
                >
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
              <Button className="flex items-center space-x-2">
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
                    <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                          <h3 className="font-medium">{user.firstName} {user.lastName}</h3>
                          <p className="text-sm text-gray-600">@{user.username}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={user.isActive ? "default" : "secondary"}>
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
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
              <Button className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>Register Client</span>
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>OAuth Clients</CardTitle>
                <CardDescription>Registered OAuth 2.0 applications</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {clients.map((client) => (
                    <div key={client.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <Key className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-medium">{client.name}</h3>
                          <p className="text-sm text-gray-600">{client.clientId}</p>
                          <p className="text-sm text-gray-500">{client.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={client.isPublic ? "secondary" : "default"}>
                          {client.isPublic ? "Public" : "Confidential"}
                        </Badge>
                        <Badge variant={client.isActive ? "default" : "secondary"}>
                          {client.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
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
              <Card>
                <CardHeader>
                  <CardTitle>Available Scopes</CardTitle>
                  <CardDescription>OAuth 2.0 scopes and their descriptions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">openid</span>
                        <p className="text-sm text-gray-600">OpenID Connect authentication</p>
                      </div>
                      <Badge>Default</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">profile</span>
                        <p className="text-sm text-gray-600">User profile information</p>
                      </div>
                      <Badge variant="secondary">Optional</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">email</span>
                        <p className="text-sm text-gray-600">User email address</p>
                      </div>
                      <Badge variant="secondary">Optional</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">admin</span>
                        <p className="text-sm text-gray-600">Administrative privileges</p>
                      </div>
                      <Badge variant="destructive">Restricted</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resource Permissions</CardTitle>
                  <CardDescription>Resource-based access control</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">User Management</span>
                        <p className="text-sm text-gray-600">Create, read, update users</p>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">Client Management</span>
                        <p className="text-sm text-gray-600">OAuth client administration</p>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">Audit Logs</span>
                        <p className="text-sm text-gray-600">View system audit trails</p>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
} 