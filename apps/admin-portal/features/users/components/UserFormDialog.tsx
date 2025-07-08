'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateUserSchema, UpdateUserSchema } from '../domain/user';
import type { CreateUserInput, UpdateUserInput } from '../domain/user';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Switch,
  toast,
} from '@repo/ui';
import { useUserManagement } from '../hooks/use-user-management';
import type { User } from '@/types/auth';

interface UserFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isProcessing: boolean;
  onSubmit: (data: CreateUserInput | UpdateUserInput) => void;
}

export function UserFormDialog({
  isOpen,
  onClose,
  user,
  isProcessing,
  onSubmit,
}: UserFormDialogProps) {
  const isEditMode = !!user;
  const form = useForm<CreateUserInput | UpdateUserInput>({
    resolver: zodResolver(isEditMode ? UpdateUserSchema : CreateUserSchema),
    defaultValues: {
      username: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(
        isEditMode
          ? {
              username: user.username,
            }
          : {
              username: '',
            }
      );
    }
  }, [isOpen, user, isEditMode, form]);

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit(data);
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? '编辑用户' : '添加用户'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>用户名</FormLabel>
                  <FormControl>
                    <Input placeholder="请输入用户名" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" disabled={isProcessing}>
                {isProcessing ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
