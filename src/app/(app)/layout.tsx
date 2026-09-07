import { AppNav } from "@/components/app/AppNav";
import { PrivyProviders } from "@/components/app/PrivyProviders";

export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PrivyProviders>
      <div className="flex min-h-dvh flex-col bg-canvas">
        <AppNav />
        <main className="flex-1">{children}</main>
      </div>
    </PrivyProviders>
  );
}
