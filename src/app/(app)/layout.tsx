import { AppNav } from "@/components/app/AppNav";
import { PrivyProviders } from "@/components/app/PrivyProviders";

export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PrivyProviders>
      <div className="product-shell app-shell">
        <AppNav />
        <main className="app-main">{children}</main>
      </div>
    </PrivyProviders>
  );
}
