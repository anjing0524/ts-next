import { Metadata } from 'next';

/**
 * Admin Portal 首页
 * 提供入口和基本信息
 */
export const metadata: Metadata = {
  title: 'Admin Portal',
  description: '管理员门户',
};

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-3xl font-bold">欢迎来到 Admin Portal</h1>
      <p className="mt-4">请通过左侧菜单或顶部导航访问各功能模块。</p>
    </main>
  );
}
