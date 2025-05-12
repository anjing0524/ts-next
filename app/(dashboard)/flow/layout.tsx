import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '数据建模系统 | 调度系统',
  description: '查看和管理调度任务状态、监控执行进度',
  keywords: '任务调度, 数据建模, 调度系统',
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        sizes: 'any',
      },
    ],
  },
};

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return <div className="container max-w-7xl mx-auto px-4 py-6 space-y-6">{children}</div>;
}
