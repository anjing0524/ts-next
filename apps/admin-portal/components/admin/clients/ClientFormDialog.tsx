'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  Input,
  Label,
  Textarea,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  toast,
} from '@repo/ui';
import { X } from 'lucide-react';
// If a proper MultiSelect is available and preferred:
// import { MultiSelect } from '@packages/ui/src/components/multi-select';
import type { Client, ClientFormData } from '@/types/admin-entities';

// These could be fetched from an API or defined as constants elsewhere
const ALL_AVAILABLE_GRANT_TYPES = [
  { id: 'authorization_code', label: 'Authorization Code' },
  { id: 'refresh_token', label: 'Refresh Token' },
  { id: 'client_credentials', label: 'Client Credentials' },
  { id: 'password', label: 'Password (ROPC)' },
  { id: 'implicit', label: 'Implicit (Legacy)' },
  // OpenID Connect specific (if applicable)
  // { id: 'urn:ietf:params:oauth:grant-type:jwt-bearer', label: 'JWT Bearer' },
  // { id: 'urn:ietf:params:oauth:grant-type:saml2-bearer', label: 'SAML2 Bearer' },
];

const ALL_AVAILABLE_RESPONSE_TYPES = [
  { id: 'code', label: 'code (Authorization Code Flow)' },
  { id: 'token', label: 'token (Implicit Flow)' },
  { id: 'id_token', label: 'id_token (OpenID Connect)' },
  { id: 'id_token token', label: 'id_token token' },
  { id: 'code id_token', label: 'code id_token' },
  { id: 'code token id_token', label: 'code token id_token' },
  { id: 'none', label: 'none (e.g. for PKCE in some flows)' },
];

// Helper to convert string to array for multi-value fields like redirectUris
const stringToArray = (str: string): string[] =>
  str
    .split(/[\s,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
const arrayToString = (arr: string[]): string => arr.join('\n');

interface ClientFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (formData: ClientFormData, existingClientId?: string) => Promise<Client | void>; // Return client if secret needs to be shown
  client?: Client | null; // Existing client data for editing
  isLoading?: boolean;
  // availableScopes: { value: string; label: string }[]; // For MultiSelect if used for scopes
}

export function ClientFormDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  client,
  isLoading,
  // availableScopes,
}: ClientFormDialogProps) {
  const getInitialFormData = (): ClientFormData => ({
    clientId: client?.clientId || '',
    clientName: client?.clientName || '',
    redirectUris: client ? arrayToString(client.redirectUris) : '',
    grantTypes: client?.grantTypes || ['authorization_code', 'refresh_token'],
    responseTypes: client?.responseTypes || ['code'],
    scope: client?.scope || 'openid profile email',
    jwksUri: client?.jwksUri || '',
    logoUri: client?.logoUri || '',
  });

  const [formData, setFormData] = useState<ClientFormData>(getInitialFormData());

  // Separate state for multi-select items if not directly part of formData object for MultiSelect component
  const [selectedGrantTypes, setSelectedGrantTypes] = useState<Set<string>>(
    new Set(formData.grantTypes)
  );
  const [selectedResponseTypes, setSelectedResponseTypes] = useState<Set<string>>(
    new Set(formData.responseTypes)
  );

  useEffect(() => {
    if (isOpen) {
      // When dialog opens
      const initialData = getInitialFormData();
      setFormData(initialData);
      setSelectedGrantTypes(new Set(initialData.grantTypes));
      setSelectedResponseTypes(new Set(initialData.responseTypes));
    }
  }, [client, isOpen]); // Re-initialize form when `client` or `isOpen` changes

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxGroupChange = (
    type: 'grantTypes' | 'responseTypes',
    value: string,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>
  ) => {
    setter((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(value)) {
        newSet.delete(value);
      } else {
        newSet.add(value);
      }
      // Also update formData directly
      setFormData((fPrev) => ({ ...fPrev, [type]: Array.from(newSet) }));
      return newSet;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientName.trim() || (!client && !formData.clientId.trim())) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: '客户端名称和客户端ID不能为空。',
      });
      return;
    }
    if (
      stringToArray(formData.redirectUris).length === 0 &&
      selectedGrantTypes.has('authorization_code')
    ) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: '使用授权码流程时，至少需要一个重定向URI。',
      });
      return;
    }

    const payload: ClientFormData = {
      ...formData,
      redirectUris: arrayToString(stringToArray(formData.redirectUris)), // Ensure it's a clean string for API, or send as array
      grantTypes: Array.from(selectedGrantTypes),
      responseTypes: Array.from(selectedResponseTypes),
    };
    // The API expects redirectUris as an array of strings.
    const apiPayload = {
      ...payload,
      redirectUris: stringToArray(payload.redirectUris),
    };

    await onSubmit(apiPayload, client?.id);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl">
        <DialogHeader>
          <DialogTitle>{client ? '编辑OAuth客户端' : '创建新OAuth客户端'}</DialogTitle>
          {client && (
            <DialogDescription>
              修改客户端 “{client.clientName}” (ID: {client.clientId}) 的配置。
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            {/* Client Name */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clientName" className="text-right">
                名称*
              </Label>
              <Input
                id="clientName"
                name="clientName"
                value={formData.clientName}
                onChange={handleInputChange}
                className="col-span-3"
                required
              />
            </div>
            {/* Client ID (read-only if editing) */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clientId" className="text-right">
                客户端ID*
              </Label>
              <Input
                id="clientId"
                name="clientId"
                value={formData.clientId}
                onChange={handleInputChange}
                className="col-span-3"
                disabled={!!client}
                required
              />
            </div>
            {/* Redirect URIs */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="redirectUris" className="text-right pt-1">
                重定向URI
              </Label>
              <Textarea
                id="redirectUris"
                name="redirectUris"
                value={formData.redirectUris}
                onChange={handleInputChange}
                className="col-span-3"
                placeholder="每行一个URI"
                rows={3}
              />
            </div>
            {/* Grant Types */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-1">授权类型</Label>
              <div className="col-span-3 space-y-2">
                {ALL_AVAILABLE_GRANT_TYPES.map((gt) => (
                  <div key={gt.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`gt-${gt.id}`}
                      checked={selectedGrantTypes.has(gt.id)}
                      onCheckedChange={() =>
                        handleCheckboxGroupChange('grantTypes', gt.id, setSelectedGrantTypes)
                      }
                    />
                    <Label htmlFor={`gt-${gt.id}`} className="font-normal">
                      {gt.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            {/* Response Types */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-1">响应类型</Label>
              <div className="col-span-3 space-y-2">
                {ALL_AVAILABLE_RESPONSE_TYPES.map((rt) => (
                  <div key={rt.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`rt-${rt.id}`}
                      checked={selectedResponseTypes.has(rt.id)}
                      onCheckedChange={() =>
                        handleCheckboxGroupChange('responseTypes', rt.id, setSelectedResponseTypes)
                      }
                    />
                    <Label htmlFor={`rt-${rt.id}`} className="font-normal">
                      {rt.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            {/* Scopes */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="scope" className="text-right">
                范围 (Scopes)
              </Label>
              <Input
                id="scope"
                name="scope"
                value={formData.scope}
                onChange={handleInputChange}
                className="col-span-3"
                placeholder="例如: openid profile email offline_access"
              />
            </div>
            {/* JWKS URI */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="jwksUri" className="text-right">
                JWKS URI
              </Label>
              <Input
                id="jwksUri"
                name="jwksUri"
                value={formData.jwksUri}
                onChange={handleInputChange}
                className="col-span-3"
                placeholder="(可选, 用于 private_key_jwt)"
              />
            </div>
            {/* Logo URI */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="logoUri" className="text-right">
                Logo URI
              </Label>
              <Input
                id="logoUri"
                name="logoUri"
                value={formData.logoUri}
                onChange={handleInputChange}
                className="col-span-3"
                placeholder="(可选)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              取消
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? client
                  ? '保存中...'
                  : '创建中...'
                : client
                  ? '保存更改'
                  : '创建客户端'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
