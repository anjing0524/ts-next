'use client';

import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import useAuth from '@/hooks/useAuth';
import { adminApi, authApi } from '@/lib/api'; // Assuming authApi might have password change
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
  Button,
  Input,
  Label,
  Badge,
  toast,
} from '@repo/ui';
import type {
  UserProfile,
  EditableProfileFormData,
  PasswordChangeFormData,
} from '@/types/admin-entities'; // 引入共享类型

export default function ProfilePage() {
  // EditableProfile and PasswordChange are now EditableProfileFormData and PasswordChangeFormData
  const {
    user,
    isLoading: authLoading,
    error: authError,
    fetchUserProfile,
    accessToken,
  } = useAuth();

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState<EditableProfile>({
    displayName: '',
    email: '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState<PasswordChange>({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // 当用户信息加载或更新时，填充表单
  useEffect(() => {
    if (user) {
      setProfileData({
        displayName: user.displayName || user.username || '',
        email: user.email || '',
      });
    }
  }, [user]);

  // 处理个人资料输入变化
  const handleProfileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfileData((prev) => ({ ...prev, [name]: value }));
  };

  // 保存个人资料
  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileError(null);
    try {
      // TODO: Validate profileData (e.g., using Zod)
      if (!profileData.displayName || !profileData.email) {
        throw new Error('显示名称和邮箱不能为空。');
      }
      // Assuming adminApi.updateUserProfile exists and works for the current user
      // Alternatively, a dedicated endpoint like /api/v2/users/me/profile might be better
      await adminApi.updateUserProfile(profileData);
      toast({ title: '成功', description: '个人资料已更新。' });
      setIsEditingProfile(false);
      if (accessToken) {
        // 重新获取用户信息以更新显示
        await fetchUserProfile(accessToken);
      }
    } catch (error: any) {
      setProfileError(error.message || '更新个人资料失败。');
      toast({
        variant: 'destructive',
        title: '错误',
        description: error.message || '更新个人资料失败。',
      });
    } finally {
      setProfileLoading(false);
    }
  };

  // 处理密码输入变化
  const handlePasswordInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
  };

  // 修改密码
  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordError(null);
    try {
      if (passwordData.newPassword !== passwordData.confirmNewPassword) {
        throw new Error('新密码和确认密码不匹配。');
      }
      if (passwordData.newPassword.length < 8) {
        // Example validation
        throw new Error('新密码长度至少为8位。');
      }
      // Assuming an API endpoint for password change exists, e.g., in authApi
      // await authApi.changePassword(user.id, passwordData.currentPassword, passwordData.newPassword);
      // Placeholder for API call:
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API call
      // For a real API, it might be:
      // await authApi.changePassword({
      //   currentPassword: passwordData.currentPassword,
      //   newPassword: passwordData.newPassword
      // });

      toast({ title: '成功', description: '密码已修改。请重新登录。' }); // Usually requires re-login
      setIsChangingPassword(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
      // logout(); // Optionally force logout
    } catch (error: any) {
      setPasswordError(error.message || '修改密码失败。');
      toast({
        variant: 'destructive',
        title: '错误',
        description: error.message || '修改密码失败。',
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  if (authLoading) {
    return <div className="p-6 text-center">加载用户信息...</div>;
  }

  if (authError || !user) {
    return (
      <div className="p-6 text-red-600 text-center">
        {authError || '无法加载用户信息，请确保您已登录。'}
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl py-8 px-4 md:px-6 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">个人资料</h1>
        <p className="text-muted-foreground mt-1">管理您的账户信息和设置。</p>
      </header>

      {/* 基本信息卡片 */}
      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>查看和编辑您的基本账户信息。</CardDescription>
        </CardHeader>
        <form onSubmit={handleSaveProfile}>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="username">用户名</Label>
              <Input id="username" value={user.username} disabled className="bg-muted" />
            </div>
            <div>
              <Label htmlFor="displayName">显示名称</Label>
              <Input
                id="displayName"
                name="displayName"
                value={profileData.displayName}
                onChange={handleProfileInputChange}
                disabled={!isEditingProfile || profileLoading}
              />
            </div>
            <div>
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={profileData.email}
                onChange={handleProfileInputChange}
                disabled={!isEditingProfile || profileLoading}
              />
            </div>
            {profileError && <p className="text-sm text-destructive">{profileError}</p>}
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            {isEditingProfile ? (
              <div className="flex gap-2">
                <Button type="submit" disabled={profileLoading}>
                  {profileLoading ? '保存中...' : '保存更改'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditingProfile(false);
                    setProfileError(null);
                    // Reset form to original user data
                    if (user)
                      setProfileData({
                        displayName: user.displayName || user.username || '',
                        email: user.email || '',
                      });
                  }}
                >
                  取消
                </Button>
              </div>
            ) : (
              <Button onClick={() => setIsEditingProfile(true)}>编辑个人资料</Button>
            )}
          </CardFooter>
        </form>
      </Card>

      {/* 修改密码卡片 */}
      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>定期更新您的密码以增强账户安全。</CardDescription>
        </CardHeader>
        <form onSubmit={handleChangePassword}>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="currentPassword">当前密码</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                value={passwordData.currentPassword}
                onChange={handlePasswordInputChange}
                disabled={passwordLoading}
                required
              />
            </div>
            <div>
              <Label htmlFor="newPassword">新密码</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                value={passwordData.newPassword}
                onChange={handlePasswordInputChange}
                disabled={passwordLoading}
                required
              />
            </div>
            <div>
              <Label htmlFor="confirmNewPassword">确认新密码</Label>
              <Input
                id="confirmNewPassword"
                name="confirmNewPassword"
                type="password"
                value={passwordData.confirmNewPassword}
                onChange={handlePasswordInputChange}
                disabled={passwordLoading}
                required
              />
            </div>
            {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? '处理中...' : '修改密码'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* 权限信息卡片 */}
      <Card>
        <CardHeader>
          <CardTitle>账户权限</CardTitle>
          <CardDescription>您当前拥有的权限列表。</CardDescription>
        </CardHeader>
        <CardContent>
          {user.permissions && user.permissions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {user.permissions.map((permission) => (
                <Badge key={permission} variant="secondary">
                  {permission}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">您当前没有任何特定权限。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// TODO:
// 1. Implement actual API call for password change in `authApi` or `adminApi`.
//    The current one is a placeholder (`new Promise`).
//    The endpoint might be something like `/api/v2/users/me/password`.
// 2. Refine Zod validation for profile and password forms.
// 3. Add an entry point for this page, e.g., in a user dropdown menu in the site header.
// 4. Consider UX for password change success (e.g., auto-logout or session refresh).
// 5. Ensure `adminApi.updateUserProfile` correctly targets the current user or use a specific
//    `/api/v2/users/me/profile` type of endpoint. The current `adminApi.updateUserProfile` in `api.ts`
//    is a general one and might need adjustment or a new method.
// 6. Internationalization for messages and labels.
