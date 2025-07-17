'use client';

import { useAuth } from '@repo/ui/hooks';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import {
  useSystemConfigQuery,
  useUpdateSystemConfigMutation,
} from '@/features/system-config/queries';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Switch,
  toast,
  Skeleton,
  PermissionGuard,
  Alert,
  AlertDescription,
  AlertTitle,
} from '@repo/ui';
import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

const configFormSchema = z.object({
  accessTokenLifetime: z.coerce
    .number()
    .int()
    .positive({ message: '访问令牌生命周期必须是正数。' })
    .min(60, { message: '访问令牌生命周期至少为60秒。' }),
  refreshTokenLifetime: z.coerce
    .number()
    .int()
    .positive({ message: '刷新令牌生命周期必须是正数。' })
    .min(3600, { message: '刷新令牌生命周期至少为3600秒。' }),
  allowPasswordGrant: z.boolean(),
});

type ConfigFormValues = z.infer<typeof configFormSchema>;

function SystemConfigForm() {
  const { data: config, isLoading, isError, error } = useSystemConfigQuery();
  const updateConfig = useUpdateSystemConfigMutation();

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configFormSchema),
    defaultValues: {
      accessTokenLifetime: 3600,
      refreshTokenLifetime: 2592000,
      allowPasswordGrant: false,
    },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        accessTokenLifetime: (config.value as any).accessTokenLifetime,
        refreshTokenLifetime: (config.value as any).refreshTokenLifetime,
        allowPasswordGrant: (config.value as any).allowPasswordGrant,
      });
    }
  }, [config, form]);

  function onSubmit(data: ConfigFormValues) {
    updateConfig.mutate(
      { value: data },
      {
        onSuccess: () => {
          toast({ title: '成功', description: '系统配置已更新。' });
        },
        onError: (error) => {
          toast({
            variant: 'destructive',
            title: '更新失败',
            description: error.message,
          });
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex items-center space-x-2">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>加载配置失败</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="accessTokenLifetime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>访问令牌生命周期 (秒)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="例如: 3600" {...field} />
              </FormControl>
              <FormDescription>Access Token 的有效时间，单位为秒。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="refreshTokenLifetime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>刷新令牌生命周期 (秒)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="例如: 2592000" {...field} />
              </FormControl>
              <FormDescription>Refresh Token 的有效时间，单位为秒。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="allowPasswordGrant"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">允许密码授权模式</FormLabel>
                <FormDescription>
                  是否允许客户端使用 Resource Owner Password Credentials Grant。
                  出于安全考虑，强烈建议禁用此模式。
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={updateConfig.isPending}>
          {updateConfig.isPending ? '保存中...' : '保存配置'}
        </Button>
      </form>
    </Form>
  );
}

function SystemConfigPageContent() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">系统配置</h1>
        <p className="text-muted-foreground">管理 OAuth 服务的核心安全和行为参数。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>令牌设置</CardTitle>
          <CardDescription>配置访问令牌和刷新令牌的生命周期。</CardDescription>
        </CardHeader>
        <CardContent>
          <SystemConfigForm />
        </CardContent>
      </Card>
    </div>
  );
}

export default function GuardedSystemConfigPage() {
  const { user, isLoading } = useAuth();
  return (
    <PermissionGuard requiredPermission="system:config:edit" user={user} isLoading={isLoading}>
      <SystemConfigPageContent />
    </PermissionGuard>
  );
}
