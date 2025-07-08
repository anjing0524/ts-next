/**
 * Public layout for authentication pages (login, callback, etc.).
 * This layout does not have any route protection.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
