// This file needs to be refactored to not use email.
// For now, we will comment out the parts that use email.
'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Separator, toast } from '@repo/ui';
import { useAuth } from '@repo/ui/hooks';
import { adminApi } from '@/lib/api';

const profileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required'),
  // email: z.string().email({ message: 'Please enter a valid email address.' }),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
});

export default function ProfilePage() {
  const { user, isLoading: isUserLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
      // email: '',
    },
  });

  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
    },
  });

  useEffect(() => {
    if (user) {
      profileForm.reset({
        displayName: user.displayName || '',
        // email: user.email || '',
      });
    }
  }, [user, profileForm]);

  const onProfileSubmit = async (data: z.infer<typeof profileSchema>) => {
    setIsSubmitting(true);
    try {
      await adminApi.updateUserProfile(data);
      toast({ title: 'Success', description: 'Profile updated successfully.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onPasswordSubmit = async (data: z.infer<typeof passwordSchema>) => {
    setIsSubmitting(true);
    try {
      await adminApi.updatePassword(data);
      toast({ title: 'Success', description: 'Password updated successfully.' });
      passwordForm.reset();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isUserLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input id="displayName" {...profileForm.register('displayName')} />
              {profileForm.formState.errors.displayName && (
                <p className="text-sm text-red-600">{profileForm.formState.errors.displayName.message}</p>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Profile'}</Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input id="currentPassword" type="password" {...passwordForm.register('currentPassword')} />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-sm text-red-600">{passwordForm.formState.errors.currentPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input id="newPassword" type="password" {...passwordForm.register('newPassword')} />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-sm text-red-600">{passwordForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Changing...' : 'Change Password'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

