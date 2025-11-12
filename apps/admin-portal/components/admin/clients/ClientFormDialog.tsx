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
  toast,
} from '@repo/ui';
import type { Client } from '@/types/auth';

// --- Helper Functions ---
const stringToArray = (str: string): string[] =>
  str
    .split(/[\s,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const arrayToString = (arr: string[] | undefined): string => (arr || []).join('\n');

// --- Constants ---
const ALL_AVAILABLE_GRANT_TYPES = [
  { id: 'authorization_code', label: 'Authorization Code' },
  { id: 'refresh_token', label: 'Refresh Token' },
  { id: 'client_credentials', label: 'Client Credentials' },
  { id: 'password', label: 'Password (ROPC)' },
  { id: 'implicit', label: 'Implicit (Legacy)' },
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

// --- Type Definitions ---
interface ClientFormState {
  clientId: string;
  clientName: string;
  redirectUris: string;
  grantTypes: string[];
  responseTypes: string[];
  scope: string;
  jwksUri: string;
  logoUri: string;
}

export interface ClientApiPayload {
  clientId: string;
  name: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  allowedScopes: string[]; // API expects allowedScopes
  jwksUri?: string;
  logoUri?: string;
}

interface ClientFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (formData: ClientApiPayload, existingClientId?: string) => Promise<Client | void>;
  client?: Client | null;
  isLoading?: boolean;
}

export function ClientFormDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  client,
  isLoading,
}: ClientFormDialogProps) {
  const getInitialFormState = (): ClientFormState => ({
    clientId: client?.clientId || '',
    clientName: client?.name || '',
    redirectUris: arrayToString(client?.redirectUris), // Convert API array response to string for form
    grantTypes: Array.isArray(client?.grantTypes) ? client.grantTypes : [],
    responseTypes: Array.isArray(client?.responseTypes) ? client.responseTypes : ['code'],
    scope: arrayToString(client?.allowedScopes) || 'openid profile email', // Convert API array response to string for form
    jwksUri: client?.jwksUri || '',
    logoUri: client?.logoUri || '',
  });

  const [formState, setFormState] = useState<ClientFormState>(getInitialFormState());

  useEffect(() => {
    if (isOpen) {
      setFormState(getInitialFormState());
    }
  }, [client, isOpen]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxGroupChange = (type: 'grantTypes' | 'responseTypes', value: string) => {
    setFormState((prev) => {
      const currentValues = new Set(prev[type]);
      if (currentValues.has(value)) {
        currentValues.delete(value);
      } else {
        currentValues.add(value);
      }
      return { ...prev, [type]: Array.from(currentValues) };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.clientName.trim() || (!client && !formState.clientId.trim())) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Client Name and Client ID are required.',
      });
      return;
    }
    if (
      stringToArray(formState.redirectUris).length === 0 &&
      formState.grantTypes.includes('authorization_code')
    ) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'At least one Redirect URI is required for the Authorization Code grant type.',
      });
      return;
    }

    const apiPayload: ClientApiPayload = {
      clientId: formState.clientId,
      name: formState.clientName,
      redirectUris: stringToArray(formState.redirectUris),
      grantTypes: formState.grantTypes,
      responseTypes: formState.responseTypes,
      allowedScopes: stringToArray(formState.scope), // Convert scope string to array for API
      jwksUri: formState.jwksUri || undefined,
      logoUri: formState.logoUri || undefined,
    };

    await onSubmit(apiPayload, client?.id);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl">
        <DialogHeader>
          <DialogTitle>{client ? 'Edit OAuth Client' : 'Create New OAuth Client'}</DialogTitle>
          {client && (
            <DialogDescription>
              Modify configuration for &quot;{client.name}&quot; (ID: {client.clientId}).
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            {/* Client Name */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clientName" className="text-right">
                Name*
              </Label>
              <Input
                id="clientName"
                name="clientName"
                value={formState.clientName}
                onChange={handleInputChange}
                className="col-span-3"
                required
              />
            </div>
            {/* Client ID (read-only if editing) */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clientId" className="text-right">
                Client ID*
              </Label>
              <Input
                id="clientId"
                name="clientId"
                value={formState.clientId}
                onChange={handleInputChange}
                className="col-span-3"
                disabled={!!client}
                required
              />
            </div>
            {/* Redirect URIs */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="redirectUris" className="text-right pt-1">
                Redirect URIs
              </Label>
              <Textarea
                id="redirectUris"
                name="redirectUris"
                value={formState.redirectUris}
                onChange={handleInputChange}
                className="col-span-3"
                placeholder="One URI per line"
                rows={3}
              />
            </div>
            {/* Grant Types */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-1">Grant Types</Label>
              <div className="col-span-3 space-y-2">
                {ALL_AVAILABLE_GRANT_TYPES.map((gt) => (
                  <div key={gt.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`gt-${gt.id}`}
                      checked={formState.grantTypes.includes(gt.id)}
                      onCheckedChange={() => handleCheckboxGroupChange('grantTypes', gt.id)}
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
              <Label className="text-right pt-1">Response Types</Label>
              <div className="col-span-3 space-y-2">
                {ALL_AVAILABLE_RESPONSE_TYPES.map((rt) => (
                  <div key={rt.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`rt-${rt.id}`}
                      checked={formState.responseTypes.includes(rt.id)}
                      onCheckedChange={() => handleCheckboxGroupChange('responseTypes', rt.id)}
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
                Scopes
              </Label>
              <Input
                id="scope"
                name="scope"
                value={formState.scope}
                onChange={handleInputChange}
                className="col-span-3"
                placeholder="e.g., openid profile email offline_access"
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
                value={formState.jwksUri}
                onChange={handleInputChange}
                className="col-span-3"
                placeholder="(Optional, for private_key_jwt)"
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
                value={formState.logoUri}
                onChange={handleInputChange}
                className="col-span-3"
                placeholder="(Optional)"
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
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? client
                  ? 'Saving...'
                  : 'Creating...'
                : client
                  ? 'Save Changes'
                  : 'Create Client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
