import type { Metadata } from 'next'
import './globals.css'

// 使用系统字体避免网络依赖
// Use system fonts to avoid network dependencies

export const metadata: Metadata = {
  title: 'Kline Service',
  description: 'K线图表服务',
}

/**
 * 根布局组件
 * @param children - 子组件
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="font-sans">
        {children}
      </body>
    </html>
  )
} 