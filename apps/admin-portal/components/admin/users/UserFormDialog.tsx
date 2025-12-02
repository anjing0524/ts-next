'use client';
import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  toast,
} from '@repo/ui';
import { api } from '../../../lib/api';
import type { User } from '@/types/auth';

interface UserFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSuccess: () => void;
  currentUser: User | null;
}

export function UserFormDialog({
  isOpen,
  onOpenChange,
  onSuccess,
  currentUser,
}: UserFormDialogProps) {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    displayName: '',
    firstName: '',
    lastName: '',
    organization: '',
    department: '',
    isActive: true,
    mustChangePassword: true,
    roles: [] as string[],
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setFormData({
        username: currentUser.username || '',
        password: '', // Password should not be pre-filled
        displayName: currentUser.displayName || '',
        firstName: currentUser.firstName || '',
        lastName: currentUser.lastName || '',
        organization: currentUser.organization || '',
        department: currentUser.department || '',
        isActive: currentUser.isActive,
        mustChangePassword: currentUser.mustChangePassword,
        roles: currentUser.userRoles ? currentUser.userRoles.map((ur) => ur.roleId) : [],
      });
    } else {
      setFormData({
        username: '',
        password: '',
        displayName: '',
        firstName: '',
        lastName: '',
        organization: '',
        department: '',
        isActive: true,
        mustChangePassword: true,
        roles: [],
      });
    }
  }, [currentUser, isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSwitchChange = (checked: boolean, name: string) => {
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (currentUser) {
        // Update user
        await api.updateUser(currentUser.id, {
          displayName: formData.displayName,
          firstName: formData.firstName,
          lastName: formData.lastName,
          organization: formData.organization,
          department: formData.department,
          isActive: formData.isActive,
          mustChangePassword: formData.mustChangePassword,
          // roles: formData.roles, // Role update might be a separate endpoint
        });
        toast({ title: 'Success', description: 'User updated successfully.' });
      } else {
        // Create user
        await api.createUser({
          username: formData.username,
          password: formData.password,
          displayName: formData.displayName,
          isActive: formData.isActive,
          mustChangePassword: formData.mustChangePassword,
          roleIds: formData.roles,
        });
        toast({ title: 'Success', description: 'User created successfully.' });
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{currentUser ? 'Edit User' : 'Create New User'}</DialogTitle>
          <DialogDescription>
            {currentUser
              ? 'Edit the details of the existing user.'
              : 'Enter the details for the new user.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                disabled={!!currentUser}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                name="displayName"
                value={formData.displayName}
                onChange={handleInputChange}
              />
            </div>
            {!currentUser && (
              <div className="space-y-2 col-span-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Input
                id="organization"
                name="organization"
                value={formData.organization}
                onChange={handleInputChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                name="department"
                value={formData.department}
                onChange={handleInputChange}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) => handleSwitchChange(checked, 'isActive')}
            />
            <Label htmlFor="isActive">User is Active</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="mustChangePassword"
              checked={formData.mustChangePassword}
              onCheckedChange={(checked) => handleSwitchChange(checked, 'mustChangePassword')}
            />
            <Label htmlFor="mustChangePassword">User must change password on next login</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
