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
} from '@repo/ui';
import type { Role, RoleFormData } from '@/types/admin-entities';

interface RoleFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (formData: RoleFormData) => Promise<void>;
  role?: Role | null; // Existing role data for editing
  isLoading?: boolean;
}

export function RoleFormDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  role,
  isLoading,
}: RoleFormDialogProps) {
  const [formData, setFormData] = useState<RoleFormData>({
    name: '',
    description: '',
  });

  useEffect(() => {
    if (role) {
      setFormData({
        name: role.name || '',
        description: role.description || '',
      });
    } else {
      // Reset for create mode
      setFormData({ name: '', description: '' });
    }
  }, [role, isOpen]); // Rely on isOpen to reset form when dialog re-opens for create

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      // Basic validation, more robust validation (e.g. Zod) can be added
      alert('角色名称不能为空。'); // Replace with toast or better validation message
      return;
    }
    await onSubmit(formData);
    // onOpenChange(false); // Parent component should handle closing on successful submit
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{role ? '编辑角色' : '创建新角色'}</DialogTitle>
          {role && <DialogDescription>修改角色 “{role.name}” 的信息。</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                名称*
              </Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="col-span-3"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="description" className="text-right pt-1">
                描述
              </Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                className="col-span-3"
                rows={3}
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
              {isLoading ? (role ? '保存中...' : '创建中...') : role ? '保存更改' : '创建角色'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
