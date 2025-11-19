'use client';

import { useState } from 'react';
import { Globe } from 'lucide-react';
import { Button } from '@repo/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui';
import { useLocale } from '@/lib/i18n/locale-provider';
import { locales, localeNames, type Locale } from '@/i18n';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const [isChanging, setIsChanging] = useState(false);

  const handleLocaleChange = async (newLocale: Locale) => {
    if (newLocale === locale || isChanging) return;

    setIsChanging(true);
    try {
      // Save locale preference
      setLocale(newLocale);
    } catch (error) {
      console.error('Failed to change language:', error);
      setIsChanging(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" disabled={isChanging}>
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{localeNames[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => handleLocaleChange(loc)}
            className={locale === loc ? 'bg-accent' : ''}
          >
            {localeNames[loc]}
            {locale === loc && <span className="ml-2">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
