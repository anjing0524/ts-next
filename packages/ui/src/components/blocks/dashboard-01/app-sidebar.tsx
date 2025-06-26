import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation"; // For highlighting active links
import * as LucideIcons from "lucide-react"; // Import all icons
import { cn } from "../../../utils";
import { Button } from "../../button"; // Assuming button.tsx is directly in components/
import { ScrollArea } from "../../scroll-area"; // Assuming scroll-area.tsx is directly in components/
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../collapsible"; // Assuming collapsible.tsx is directly in components/
import type { MenuItem } from "../../../types"; // Import MenuItem type

interface AppSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  menuItems?: MenuItem[];
  logo?: React.ReactNode; // Optional prop for a logo area
  headerText?: string; // Optional prop for the header text like "Dashboard Menu"
  onItemClick?: () => void; // Callback for when a nav item is clicked (especially for mobile drawer)
}

// Helper to render dynamic icons
const DynamicIcon = ({ name, ...props }: { name: keyof typeof LucideIcons } & LucideIcons.LucideProps) => {
  const IconComponent = LucideIcons[name];
  if (!IconComponent) {
    // Fallback or default icon if name is invalid
    return <LucideIcons.CircleHelp {...props} />;
  }
  return <IconComponent {...props} />;
};

export function AppSidebar({ className, menuItems = [], logo, headerText = "主菜单", onItemClick, ...props }: AppSidebarProps) {
  const pathname = usePathname();

  const renderMenuItems = (items: MenuItem[], isSubmenu = false) => {
    return items.map((item) => {
      const isActive = item.href ? pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)) : false;

      if (item.children && item.children.length > 0) {
        return (
          <Collapsible key={item.id} defaultOpen={item.children.some(child => child.href ? pathname.startsWith(child.href) : false)}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start text-sm font-medium",
                  isSubmenu ? "pl-10" : "pl-4", // Indent submenus trigger
                  isActive && "bg-accent text-accent-foreground"
                )}
              >
                {item.icon && <DynamicIcon name={item.icon} className="mr-2 h-4 w-4" />}
                {item.title}
                <LucideIcons.ChevronDown className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-[data-state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1 pb-1 space-y-1">
              {renderMenuItems(item.children, true)}
            </CollapsibleContent>
          </Collapsible>
        );
      }

      return (
        <Button
          key={item.id}
          asChild
          variant="ghost"
          className={cn(
            "w-full justify-start text-sm",
            isSubmenu ? "pl-10" : "pl-4", // Indent submenu items
            isActive && "bg-accent text-accent-foreground"
          )}
        >
          <Link href={item.href} target={item.external ? "_blank" : undefined} onClick={item.external ? undefined : onItemClick}> {/* Call onItemClick for internal links */}
            {item.icon && <DynamicIcon name={item.icon} className="mr-2 h-4 w-4" />}
            {item.title}
          </Link>
        </Button>
      );
    });
  };

  return (
    <aside className={cn("h-full flex flex-col", className)} {...props}> {/* Ensure it takes full height if in a flex container like DrawerContent */}
      {logo && <div className="p-4 border-b shrink-0">{logo}</div>}
      <div className={cn("space-y-4 py-4 flex-grow", !logo && "pt-8")}> {/* flex-grow for scrollarea parent */}
        <div className="px-3 py-2 h-full flex flex-col">
          {headerText && (
             <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight shrink-0">
              {headerText}
            </h2>
          )}
          <ScrollArea className="flex-grow"> {/* flex-grow for scrollarea itself */}
            <div className="space-y-1 pr-2"> {/* Added pr-2 to prevent scrollbar overlap */}
              {renderMenuItems(menuItems)}
            </div>
          </ScrollArea>
        </div>
      </div>
    </aside>
  );
}
