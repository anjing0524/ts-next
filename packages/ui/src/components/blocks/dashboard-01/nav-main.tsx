import * as React from 'react';
import Link from 'next/link';
import { cn } from '../../../utils';

export function MainNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <nav className={cn('flex items-center space-x-4 lg:space-x-6', className)} {...props}>
      <Link
        href="/dashboard" // Example link
        className="text-sm font-medium transition-colors hover:text-primary"
      >
        Overview
      </Link>
      {/* Add more links as needed */}
    </nav>
  );
}
