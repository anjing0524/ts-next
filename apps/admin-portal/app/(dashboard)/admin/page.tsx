'use client';

import { useAuth } from '@repo/ui/hooks';
import { useDashboardStatsQuery } from '@/features/dashboard/hooks/useDashboardStatsQuery';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Alert,
  AlertDescription,
  AlertTitle,
  PermissionGuard,
} from '@repo/ui';
import { AlertTriangle, Users, AppWindow, ShieldCheck, KeyRound } from 'lucide-react';
import { DashboardLoading } from '@/components/common/LoadingStates';
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
} from 'recharts';

function StatCard({
  title,
  value,
  icon: Icon,
  isLoading,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="h-4 w-4 bg-muted/50 rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-8 w-1/2 bg-muted/50 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function DashboardPageContent() {
  const { data, isLoading, isError, error } = useDashboardStatsQuery();

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>无法加载仪表盘统计数据：{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return <DashboardLoading />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">管理员仪表盘</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="用户总数"
          value={data?.userCount ?? '...'}
          icon={Users}
          isLoading={false}
        />
        <StatCard
          title="客户端总数"
          value={data?.clientCount ?? '...'}
          icon={AppWindow}
          isLoading={false}
        />
        <StatCard
          title="角色总数"
          value={data?.roleCount ?? '...'}
          icon={ShieldCheck}
          isLoading={false}
        />
        <StatCard
          title="今日颁发令牌"
          value={data?.tokensIssuedToday ?? '...'}
          icon={KeyRound}
          isLoading={false}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>用户增长趋势</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data?.userGrowth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#8884d8" name="新增用户数" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

export default function GuardedDashboardPage() {
  const { user, isLoading } = useAuth();

  return (
    <PermissionGuard requiredPermission="dashboard:view" user={user} isLoading={isLoading}>
      <DashboardPageContent />
    </PermissionGuard>
  );
}
