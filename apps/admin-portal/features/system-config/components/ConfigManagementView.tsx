'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, RefreshCw } from 'lucide-react';
import { useSystemConfigQuery, useUpdateSystemConfigMutation } from '../queries';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

// 系统配置表单验证模式
const configSchema = z.object({
  siteName: z.string().min(1, '站点名称不能为空'),
  siteDescription: z.string().optional(),
  maintenanceMode: z.boolean(),
  registrationEnabled: z.boolean(),
  emailVerificationRequired: z.boolean(),
  maxLoginAttempts: z.number().min(1).max(10),
  sessionTimeout: z.number().min(5).max(1440), // 5分钟到24小时
  passwordMinLength: z.number().min(6).max(32),
  passwordRequireSpecialChar: z.boolean(),
  passwordRequireNumber: z.boolean(),
  passwordRequireUppercase: z.boolean(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpUsername: z.string().optional(),
  smtpPassword: z.string().optional(),
  smtpSecure: z.boolean(),
});

type ConfigFormData = z.infer<typeof configSchema>;

export function ConfigManagementView() {
  const { data: config, isLoading, error, refetch } = useSystemConfigQuery();
  const updateConfigMutation = useUpdateSystemConfigMutation();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<ConfigFormData>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      siteName: '',
      siteDescription: '',
      maintenanceMode: false,
      registrationEnabled: true,
      emailVerificationRequired: false,
      maxLoginAttempts: 5,
      sessionTimeout: 60,
      passwordMinLength: 8,
      passwordRequireSpecialChar: true,
      passwordRequireNumber: true,
      passwordRequireUppercase: true,
      smtpHost: '',
      smtpPort: 587,
      smtpUsername: '',
      smtpPassword: '',
      smtpSecure: true,
    },
  });

  // 当配置数据加载完成时，更新表单默认值
  React.useEffect(() => {
    if (config) {
      reset({
        siteName: config.siteName || '',
        siteDescription: config.siteDescription || '',
        maintenanceMode: config.maintenanceMode || false,
        registrationEnabled: config.registrationEnabled ?? true,
        emailVerificationRequired: config.emailVerificationRequired || false,
        maxLoginAttempts: config.maxLoginAttempts || 5,
        sessionTimeout: config.sessionTimeout || 60,
        passwordMinLength: config.passwordMinLength || 8,
        passwordRequireSpecialChar: config.passwordRequireSpecialChar ?? true,
        passwordRequireNumber: config.passwordRequireNumber ?? true,
        passwordRequireUppercase: config.passwordRequireUppercase ?? true,
        smtpHost: config.smtpHost || '',
        smtpPort: config.smtpPort || 587,
        smtpUsername: config.smtpUsername || '',
        smtpPassword: config.smtpPassword || '',
        smtpSecure: config.smtpSecure ?? true,
      });
    }
  }, [config, reset]);

  const onSubmit = async (data: ConfigFormData) => {
    try {
      await updateConfigMutation.mutateAsync(data);
      toast.success('系统配置已更新');
    } catch (error) {
      toast.error('更新系统配置失败');
    }
  };

  const handleRefresh = () => {
    refetch();
    toast.info('配置已刷新');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">加载系统配置...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          加载系统配置失败: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">系统配置</h1>
          <p className="text-muted-foreground">
            管理系统的全局配置和设置
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            disabled={!isDirty || updateConfigMutation.isPending}
          >
            {updateConfigMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            保存配置
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* 基本设置 */}
        <Card>
          <CardHeader>
            <CardTitle>基本设置</CardTitle>
            <CardDescription>
              配置站点的基本信息和显示设置
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="siteName">站点名称</Label>
                <Input
                  id="siteName"
                  {...register('siteName')}
                  placeholder="输入站点名称"
                />
                {errors.siteName && (
                  <p className="text-sm text-destructive">{errors.siteName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="siteDescription">站点描述</Label>
                <Textarea
                  id="siteDescription"
                  {...register('siteDescription')}
                  placeholder="输入站点描述"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="maintenanceMode"
                checked={watch('maintenanceMode')}
                onCheckedChange={(checked) => setValue('maintenanceMode', checked)}
              />
              <Label htmlFor="maintenanceMode">维护模式</Label>
            </div>
          </CardContent>
        </Card>

        {/* 用户注册设置 */}
        <Card>
          <CardHeader>
            <CardTitle>用户注册设置</CardTitle>
            <CardDescription>
              配置用户注册和验证相关设置
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="registrationEnabled"
                  checked={watch('registrationEnabled')}
                  onCheckedChange={(checked) => setValue('registrationEnabled', checked)}
                />
                <Label htmlFor="registrationEnabled">允许用户注册</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="emailVerificationRequired"
                  checked={watch('emailVerificationRequired')}
                  onCheckedChange={(checked) => setValue('emailVerificationRequired', checked)}
                />
                <Label htmlFor="emailVerificationRequired">需要邮箱验证</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 安全设置 */}
        <Card>
          <CardHeader>
            <CardTitle>安全设置</CardTitle>
            <CardDescription>
              配置登录安全和密码策略
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxLoginAttempts">最大登录尝试次数</Label>
                <Input
                  id="maxLoginAttempts"
                  type="number"
                  min="1"
                  max="10"
                  {...register('maxLoginAttempts', { valueAsNumber: true })}
                />
                {errors.maxLoginAttempts && (
                  <p className="text-sm text-destructive">{errors.maxLoginAttempts.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="sessionTimeout">会话超时时间（分钟）</Label>
                <Input
                  id="sessionTimeout"
                  type="number"
                  min="5"
                  max="1440"
                  {...register('sessionTimeout', { valueAsNumber: true })}
                />
                {errors.sessionTimeout && (
                  <p className="text-sm text-destructive">{errors.sessionTimeout.message}</p>
                )}
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-4">
              <h4 className="text-sm font-medium">密码策略</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="passwordMinLength">最小密码长度</Label>
                  <Input
                    id="passwordMinLength"
                    type="number"
                    min="6"
                    max="32"
                    {...register('passwordMinLength', { valueAsNumber: true })}
                  />
                  {errors.passwordMinLength && (
                    <p className="text-sm text-destructive">{errors.passwordMinLength.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="passwordRequireSpecialChar"
                    checked={watch('passwordRequireSpecialChar')}
                    onCheckedChange={(checked) => setValue('passwordRequireSpecialChar', checked)}
                  />
                  <Label htmlFor="passwordRequireSpecialChar">需要特殊字符</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="passwordRequireNumber"
                    checked={watch('passwordRequireNumber')}
                    onCheckedChange={(checked) => setValue('passwordRequireNumber', checked)}
                  />
                  <Label htmlFor="passwordRequireNumber">需要数字</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="passwordRequireUppercase"
                    checked={watch('passwordRequireUppercase')}
                    onCheckedChange={(checked) => setValue('passwordRequireUppercase', checked)}
                  />
                  <Label htmlFor="passwordRequireUppercase">需要大写字母</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SMTP 设置 */}
        <Card>
          <CardHeader>
            <CardTitle>SMTP 邮件设置</CardTitle>
            <CardDescription>
              配置系统邮件发送服务
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtpHost">SMTP 主机</Label>
                <Input
                  id="smtpHost"
                  {...register('smtpHost')}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtpPort">SMTP 端口</Label>
                <Input
                  id="smtpPort"
                  type="number"
                  {...register('smtpPort', { valueAsNumber: true })}
                  placeholder="587"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtpUsername">SMTP 用户名</Label>
                <Input
                  id="smtpUsername"
                  {...register('smtpUsername')}
                  placeholder="username@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtpPassword">SMTP 密码</Label>
                <Input
                  id="smtpPassword"
                  type="password"
                  {...register('smtpPassword')}
                  placeholder="输入SMTP密码"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="smtpSecure"
                checked={watch('smtpSecure')}
                onCheckedChange={(checked) => setValue('smtpSecure', checked)}
              />
              <Label htmlFor="smtpSecure">使用 SSL/TLS</Label>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}