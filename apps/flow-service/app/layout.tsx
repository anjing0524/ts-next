import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Flow Service',
  description: '流程图服务',
};

/**
 * 根布局组件
 * @param children - 子组件
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="">{children}</body>
    </html>
  );
}
