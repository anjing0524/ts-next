import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Admin Portal',
  description: '管理员门户',
};

/**
 * 根布局组件
 * @param children - 子组件
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
