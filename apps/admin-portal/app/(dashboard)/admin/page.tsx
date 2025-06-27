'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import useAuth from '@/hooks/useAuth';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  ScrollArea,
  toast,
} from '@repo/ui';
import { Users, Shield, Key, Activity, FileText, ExternalLink } from 'lucide-react'; // Icons for cards and links
import type { AuditLog, PaginatedResponse, DashboardStats } from '@/types/admin-entities'; // 引入共享类型

// --- 数据接口定义 ---
interface StatCardProps {
  title: string;
  value: number | string; // value can now also be string for '...' or 'Error'
  description: string;
  icon: React.ElementType;
  isLoading: boolean;
}
// AuditLog and PaginatedResponse are imported from admin-entities

const REQUIRED_DASHBOARD_PERMISSION = 'dashboard:view'; // Define a permission for viewing the dashboard
// DashboardStats type is imported from admin-entities and can be used for stats state if preferred

// --- 统计卡片组件 ---
function StatCard({ title, value, description, icon: Icon, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-1/2 animate-pulse bg-muted rounded-md" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

// --- 仪表盘核心内容 ---
function DashboardContent() {
  const { user } = useAuth(); // For welcome message

  const [userCount, setUserCount] = useState<number | string>('...');
  const [roleCount, setRoleCount] = useState<number | string>('...');
  const [clientCount, setClientCount] = useState<number | string>('...');
  const [recentAuditLogs, setRecentAuditLogs] = useState<AuditLog[]>([]);

  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  const fetchStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const [usersRes, rolesRes, clientsRes] = await Promise.all([
        adminApi.getUsers({ limit: 1, offset: 0 }),
        adminApi.getRoles({ limit: 1, offset: 0 }),
        adminApi.getClients({ limit: 1, offset: 0 }),
      ]);
      setUserCount(usersRes.meta.totalItems);
      setRoleCount(rolesRes.meta.totalItems);
      setClientCount(clientsRes.meta.totalItems);
    } catch (error: any) {
      console.error('Failed to load statistics:', error);
      toast({ variant: 'destructive', title: '错误', description: '加载统计数据失败。' });
      setUserCount('错误');
      setRoleCount('错误');
      setClientCount('错误');
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const fetchRecentLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const response: PaginatedResponse<AuditLog> = await adminApi.getAuditLogs({
        limit: 7,
        offset: 0,
        sort: 'timestamp:desc',
      });
      setRecentAuditLogs(response.data);
    } catch (error: any) {
      console.error('Failed to load recent audit logs:', error);
      toast({ variant: 'destructive', title: '错误', description: '加载最近审计日志失败。' });
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchRecentLogs();
  }, [fetchStats, fetchRecentLogs]);

  const quickLinks = [
    { href: '/admin/users', label: '用户管理', icon: Users },
    { href: '/admin/system/roles', label: '角色管理', icon: Shield },
    { href: '/admin/system/clients', label: '客户端管理', icon: Key },
    { href: '/admin/audit', label: '审计日志', icon: FileText },
    { href: '/admin/system/permissions', label: '权限列表', icon: Shield },
  ];

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          欢迎回来, {user?.displayName || user?.username || '管理员'}!
        </h1>
        <p className="text-muted-foreground mt-1">这是您的管理仪表盘，概览系统状态和常用操作。</p>
      </header>

      {/* 统计卡片区域 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="用户总数"
          value={userCount}
          description="已注册的用户数量"
          icon={Users}
          isLoading={isLoadingStats}
        />
        <StatCard
          title="角色总数"
          value={roleCount}
          description="已定义的角色数量"
          icon={Shield}
          isLoading={isLoadingStats}
        />
        <StatCard
          title="客户端总数"
          value={clientCount}
          description="已注册的OAuth客户端"
          icon={Key}
          isLoading={isLoadingStats}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 快捷链接区域 */}
        <section className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="h-5 w-5 mr-2 text-primary" />
                快捷操作
              </CardTitle>
              <CardDescription>快速访问常用管理功能。</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {quickLinks.map((link) => (
                <Button key={link.href} variant="outline" asChild className="h-auto py-3">
                  <Link
                    href={link.href}
                    className="flex flex-col items-center justify-center space-y-1"
                  >
                    <link.icon className="h-6 w-6 mb-1 text-muted-foreground" />
                    <span className="text-xs text-center">{link.label}</span>
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* 最近审计日志区域 */}
        <section className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2 text-primary" />
                最近审计日志
              </CardTitle>
              <CardDescription>最近的系统和用户活动记录。</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingLogs ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse bg-muted rounded-md" />
                  ))}
                </div>
              ) : recentAuditLogs.length > 0 ? (
                <ScrollArea className="h-72">
                  <ul className="space-y-3 pr-3">
                    {recentAuditLogs.map((log) => (
                      <li
                        key={log.id}
                        className="flex items-center justify-between p-3 border rounded-md bg-background hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" title={log.action}>
                            {log.action}{' '}
                            <span className="text-xs text-muted-foreground">({log.resource})</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            用户: {log.userId} - {new Date(log.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <Badge
                          variant={log.status === 'FAILURE' ? 'destructive' : 'outline'}
                          className="ml-2 flex-shrink-0"
                        >
                          {log.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">暂无审计日志记录。</p>
              )}
              <div className="mt-4 text-right">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin/audit">
                    查看全部 <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

// --- Main Export with PermissionGuard ---
export default function GuardedDashboardPage() {
  return (
    <PermissionGuard requiredPermission={REQUIRED_DASHBOARD_PERMISSION}>
      <DashboardContent />
    </PermissionGuard>
  );
}
