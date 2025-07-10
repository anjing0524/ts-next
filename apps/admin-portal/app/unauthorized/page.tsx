import { Button } from '@repo/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui';
import { AlertTriangle, Home, LogOut } from 'lucide-react';
import Link from 'next/link';

/**
 * 无权限页面组件
 * 当用户尝试访问没有权限的页面时显示
 */
export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <CardTitle className="text-xl font-semibold text-gray-900">
            访问被拒绝
          </CardTitle>
          <CardDescription className="text-gray-600">
            您没有权限访问此页面
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-gray-500">
            <p>您当前的角色或权限不足以访问此页面。</p>
            <p className="mt-2">请联系系统管理员获取相应权限。</p>
          </div>
          
          <div className="flex flex-col space-y-2">
            <Button asChild variant="default">
              <Link href="/admin">
                <Home className="mr-2 h-4 w-4" />
                返回首页
              </Link>
            </Button>
            
            <Button asChild variant="outline">
              <Link href="/login">
                <LogOut className="mr-2 h-4 w-4" />
                重新登录
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 