'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Locale, locales, defaultLocale } from '../../i18n';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    // Try to get locale from cookie or localStorage
    if (typeof window !== 'undefined') {
      const savedLocale = localStorage.getItem(LOCALE_COOKIE_NAME);
      if (savedLocale && locales.includes(savedLocale as Locale)) {
        return savedLocale as Locale;
      }
    }
    return defaultLocale;
  });

  const setLocale = (newLocale: Locale) => {
    if (!locales.includes(newLocale)) {
      console.warn(`Invalid locale: ${newLocale}`);
      return;
    }

    setLocaleState(newLocale);

    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCALE_COOKIE_NAME, newLocale);
      // Reload to apply locale change
      window.location.reload();
    }
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
