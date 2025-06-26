'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { DataTable, type ColumnDef } from '@repo/ui';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
  Label,
  Textarea,
  Checkbox,
  toast,
  Badge,
} from '@repo/ui';
import { PlusCircle, Edit, Trash2, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { ClientFormDialog } from '@/components/admin/clients/ClientFormDialog';
import type { Client, ClientFormData, PaginatedResponse } from '@/types/admin-entities'; // 引入共享类型

// --- 预定义常量 (可以考虑移到配置文件或单独的常量文件) ---
const defaultGrantTypes = [
  { id: 'authorization_code', label: 'Authorization Code' },
  { id: 'refresh_token', label: 'Refresh Token' },
  { id: 'client_credentials', label: 'Client Credentials' },
  { id: 'password', label: 'Password (ROPC)' }, // Discouraged for new apps
  { id: 'implicit', label: 'Implicit (Legacy)' }, // Discouraged
];

const defaultResponseTypes = [
  { id: 'code', label: 'code (Authorization Code Flow)' },
  { id: 'token', label: 'token (Implicit Flow)' },
  // { id: 'id_token', label: 'id_token (OpenID Connect)' },
  // { id: 'code token', label: 'code token' },
];

// --- 页面状态和常量 ---
const INITIAL_PAGE_LIMIT = 10;
const REQUIRED_PERMISSIONS_VIEW = ['menu:system:client:view', 'clients:list'];
const CAN_CREATE_CLIENT = 'clients:create';
const CAN_EDIT_CLIENT = 'clients:edit';
const CAN_DELETE_CLIENT = 'clients:delete';
const CAN_ROTATE_SECRET = 'clients:manage_secrets'; // Example permission for secret rotation

// --- Helper Functions ---
const stringToArray = (str: string): string[] =>
  str
    .split(/[\s,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
const arrayToString = (arr: string[]): string => arr.join('\n');

import { usePaginatedResource } from '@/hooks/usePaginatedResource'; // Import the hook

// --- 客户端管理页面核心内容 ---
function ClientsPageContent() {
  const { hasPermission } = useAuth();

  const {
    data: clients,
    isLoading,
    error,
    page,
    limit,
    totalItems,
    totalPages,
    searchTerm,
    setPage,
    setLimit,
    setSearchTerm,
    applyFilters,
    refreshData: fetchClients, // Rename for clarity
  } = usePaginatedResource<Client, { page: number; limit: number; search?: string }>(
    adminApi.getClients,
    { initialLimit: INITIAL_PAGE_LIMIT }
  );

  // Dialog states, form data, etc., remain managed by this component
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSecretDialogOpen, setIsSecretDialogOpen] = useState(false);

  const [currentClient, setCurrentClient] = useState<Client | null>(null);
  const [clientFormData, setClientFormData] = useState<ClientFormData>({
    clientId: '',
    clientName: '',
    redirectUris: '',
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    scope: 'openid profile email',
    jwksUri: '',
    logoUri: '',
  });
  const [newlyCreatedSecret, setNewlyCreatedSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [isDialogLoading, setIsDialogLoading] = useState(false); // For dialog specific loading

  const resetFormData = () => {
    setClientFormData({
      clientId: '',
      clientName: '',
      redirectUris: '',
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      scope: 'openid profile email offline_access',
      jwksUri: '',
      logoUri: '',
    });
    setSelectedGrantTypes(new Set(['authorization_code', 'refresh_token']));
    setSelectedResponseTypes(new Set(['code']));
  };

  const openCreateDialog = () => {
    resetFormData();
    setCurrentClient(null);
    setNewlyCreatedSecret(null);
    setIsFormDialogOpen(true);
  };

  const openEditDialog = (client: Client) => {
    setCurrentClient(client);
    setClientFormData({
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUris: arrayToString(client.redirectUris),
      grantTypes: client.grantTypes,
      responseTypes: client.responseTypes,
      scope: client.scope,
      jwksUri: client.jwksUri || '',
      logoUri: client.logoUri || '',
    });
    setSelectedGrantTypes(new Set(client.grantTypes));
    setSelectedResponseTypes(new Set(client.responseTypes));
    setNewlyCreatedSecret(null);
    setIsFormDialogOpen(true);
  };

  const openDeleteDialog = (client: Client) => {
    setCurrentClient(client);
    setIsDeleteDialogOpen(true);
  };

  const handleFormInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setClientFormData((prev) => ({ ...prev, [name]: value }));
  };

  const [selectedGrantTypes, setSelectedGrantTypes] = useState<Set<string>>(
    new Set(['authorization_code', 'refresh_token'])
  );
  const [selectedResponseTypes, setSelectedResponseTypes] = useState<Set<string>>(
    new Set(['code'])
  );

  const handleGrantTypeChange = (grantType: string) => {
    setSelectedGrantTypes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(grantType)) newSet.delete(grantType);
      else newSet.add(grantType);
      setClientFormData((fPrev) => ({ ...fPrev, grantTypes: Array.from(newSet) }));
      return newSet;
    });
  };

  const handleResponseTypeChange = (responseType: string) => {
    setSelectedResponseTypes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(responseType)) newSet.delete(responseType);
      else newSet.add(responseType);
      setClientFormData((fPrev) => ({ ...fPrev, responseTypes: Array.from(newSet) }));
      return newSet;
    });
  };

  const handleSubmitForm = async () => {
    // Basic Validation
    if (!clientFormData.clientName || !clientFormData.clientId) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: '客户端ID和客户端名称不能为空。',
      });
      return;
    }
    setIsLoading(true);
    const payload = {
      ...clientFormData,
      redirectUris: stringToArray(clientFormData.redirectUris),
      grantTypes: Array.from(selectedGrantTypes),
      responseTypes: Array.from(selectedResponseTypes),
    };

    try {
      let response;
      if (currentClient) {
        // Editing
        response = await adminApi.updateClient(currentClient.id, payload);
        toast({ title: '成功', description: '客户端已更新。' });
      } else {
        // Creating
        response = await adminApi.createClient(payload);
        toast({ title: '成功', description: '客户端已创建。' });
        if (response.clientSecret) {
          setNewlyCreatedSecret(response.clientSecret);
          setIsSecretDialogOpen(true); // Show secret dialog
        }
      }
      setIsFormDialogOpen(false);
      fetchClients();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: err.message || (currentClient ? '更新客户端失败。' : '创建客户端失败。'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!currentClient) return;
    setIsLoading(true);
    try {
      await adminApi.deleteClient(currentClient.id);
      toast({ title: '成功', description: '客户端已删除。' });
      setIsDeleteDialogOpen(false);
      fetchClients();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: err.message || '删除客户端失败。',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRotateSecret = async (client: Client) => {
    setIsLoading(true);
    try {
      const response = await adminApi.rotateClientSecret(client.id);
      if (response.clientSecret) {
        setCurrentClient(client); // For dialog title
        setNewlyCreatedSecret(response.clientSecret);
        setIsSecretDialogOpen(true);
        toast({ title: '成功', description: `客户端 ${client.clientName} 的密钥已更新。` });
      } else {
        toast({ variant: 'destructive', title: '错误', description: '未能获取新的客户端密钥。' });
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: err.message || '更新密钥失败。',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns = useMemo<ColumnDef<Client>[]>(
    () => [
      { accessorKey: 'clientName', header: '名称' },
      { accessorKey: 'clientId', header: '客户端ID' },
      {
        accessorKey: 'grantTypes',
        header: '授权类型',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.grantTypes.map((gt) => (
              <Badge key={gt} variant="outline">
                {gt}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: 'redirectUris',
        header: '重定向URIs',
        cell: ({ row }) => <div className="text-xs">{row.original.redirectUris.join(', ')}</div>,
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => (
          <div className="space-x-1">
            {hasPermission(CAN_EDIT_CLIENT) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditDialog(row.original)}
                title="编辑"
              >
                <Edit className="h-3 w-3" />
              </Button>
            )}
            {hasPermission(CAN_ROTATE_SECRET) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRotateSecret(row.original)}
                title="更新密钥"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
            {hasPermission(CAN_DELETE_CLIENT) && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => openDeleteDialog(row.original)}
                title="删除"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [hasPermission]
  ); // Add handleRotateSecret, openEditDialog, openDeleteDialog if not stable

  if (isLoading && !clients.length && page === 1)
    return <div className="p-6 text-center">加载客户端数据中...</div>;
  if (error && !clients.length)
    return <div className="p-6 text-red-600 text-center">错误: {error}</div>;

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">OAuth 客户端管理</h1>
          <p className="text-muted-foreground mt-1">管理已注册的OAuth客户端应用程序。</p>
        </div>
        {hasPermission(CAN_CREATE_CLIENT) && (
          <Button onClick={openCreateDialog}>
            <PlusCircle className="mr-2 h-4 w-4" /> 添加客户端
          </Button>
        )}
      </header>

      <div className="flex items-center gap-2 p-4 border rounded-lg shadow-sm">
        <Input
          placeholder="按客户端名称或ID搜索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && setPage(1)}
          className="flex-grow"
        />
        <Button onClick={() => setPage(1)}>搜索</Button>
      </div>

      <DataTable
        columns={columns}
        data={clients}
        isLoading={isLoading && clients.length > 0}
        pageCount={totalPages}
        pageIndex={page - 1}
        pageSize={limit}
        onPageChange={(newPageIndex) => setPage(newPageIndex + 1)}
        onPageSizeChange={(newPageSize) => {
          setLimit(newPageSize);
          setPage(1);
        }}
      />
      {(totalItems > 0 || page > 1) && !isLoading && !error && (
        <div className="flex items-center justify-between mt-4 py-2 border-t">
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页 (共 {totalItems} 条记录)
          </span>
        </div>
      )}
      {clients.length === 0 && !isLoading && !error && (
        <div className="text-center py-10 text-muted-foreground">没有找到客户端。</div>
      )}

      {/* Client Form Dialog (Create/Edit) */}
      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{currentClient ? '编辑客户端' : '创建新客户端'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clientName" className="text-right">
                名称
              </Label>
              <Input
                id="clientName"
                name="clientName"
                value={clientFormData.clientName}
                onChange={handleFormInputChange}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clientId" className="text-right">
                客户端ID
              </Label>
              <Input
                id="clientId"
                name="clientId"
                value={clientFormData.clientId}
                onChange={handleFormInputChange}
                className="col-span-3"
                disabled={!!currentClient}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="redirectUris" className="text-right">
                重定向URI
              </Label>
              <Textarea
                id="redirectUris"
                name="redirectUris"
                value={clientFormData.redirectUris}
                onChange={handleFormInputChange}
                className="col-span-3"
                placeholder="每行一个URI"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">授权类型</Label>
              <div className="col-span-3 space-y-2">
                {defaultGrantTypes.map((gt) => (
                  <div key={gt.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`gt-${gt.id}`}
                      checked={selectedGrantTypes.has(gt.id)}
                      onCheckedChange={() => handleGrantTypeChange(gt.id)}
                    />
                    <Label htmlFor={`gt-${gt.id}`}>{gt.label}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">响应类型</Label>
              <div className="col-span-3 space-y-2">
                {defaultResponseTypes.map((rt) => (
                  <div key={rt.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`rt-${rt.id}`}
                      checked={selectedResponseTypes.has(rt.id)}
                      onCheckedChange={() => handleResponseTypeChange(rt.id)}
                    />
                    <Label htmlFor={`rt-${rt.id}`}>{rt.label}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="scope" className="text-right">
                范围 (Scopes)
              </Label>
              <Input
                id="scope"
                name="scope"
                value={clientFormData.scope}
                onChange={handleFormInputChange}
                className="col-span-3"
                placeholder="例如: openid profile email"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="jwksUri" className="text-right">
                JWKS URI
              </Label>
              <Input
                id="jwksUri"
                name="jwksUri"
                value={clientFormData.jwksUri}
                onChange={handleFormInputChange}
                className="col-span-3"
                placeholder="(可选)"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="logoUri" className="text-right">
                Logo URI
              </Label>
              <Input
                id="logoUri"
                name="logoUri"
                value={clientFormData.logoUri}
                onChange={handleFormInputChange}
                className="col-span-3"
                placeholder="(可选)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmitForm} disabled={isLoading}>
              {isLoading ? '处理中...' : currentClient ? '保存更改' : '创建客户端'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除客户端</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            您确定要删除客户端 “{currentClient?.clientName}” (ID: {currentClient?.clientId})
            吗？此操作无法撤销。
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteClient} disabled={isLoading}>
              {isLoading ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show Client Secret Dialog */}
      <Dialog open={isSecretDialogOpen} onOpenChange={setIsSecretDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>客户端密钥 - {currentClient?.clientName || '新客户端'}</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            请立即复制并妥善保管此客户端密钥，关闭此窗口后将无法再次查看。
          </DialogDescription>
          <div className="my-4 p-3 bg-muted rounded-md font-mono text-sm relative">
            {showSecret ? newlyCreatedSecret : '••••••••••••••••••••••••••••••••'}
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setShowSecret((s) => !s)}
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(newlyCreatedSecret || '');
              toast({ title: '已复制', description: '客户端密钥已复制到剪贴板。' });
            }}
          >
            复制密钥
          </Button>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSecretDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function GuardedClientsPage() {
  return (
    <PermissionGuard requiredPermission={REQUIRED_PERMISSIONS_VIEW}>
      <ClientsPageContent />
    </PermissionGuard>
  );
}
