import { Providers } from '@/components/providers';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '数据建模系统',
  description: '数据建模与调度管理系统',
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        sizes: 'any',
      },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactElement }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
