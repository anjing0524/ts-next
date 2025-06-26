import * as LucideIcons from 'lucide-react';

export interface MenuItem {
  id: string; // 唯一标识符 (Unique identifier)
  title: string; // 菜单标题 (Menu title)
  href: string; // 链接地址 (Link URL)
  icon?: keyof typeof LucideIcons; // 图标名称 (Lucide icon name, optional)
  children?: MenuItem[]; // 子菜单项 (Sub-menu items, optional)
  external?: boolean; // Optional: for external links
  // Add any other relevant fields if needed by API or sidebar
}
