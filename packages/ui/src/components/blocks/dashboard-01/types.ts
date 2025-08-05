import dynamicIconImports from 'lucide-react/dynamicIconImports';

export type IconName = keyof typeof dynamicIconImports;

export interface MenuItem {
  id: string;
  title: string;
  href: string;
  icon?: IconName;
  children?: MenuItem[];
  external?: boolean;
}
