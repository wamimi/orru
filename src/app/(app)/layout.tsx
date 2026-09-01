import { AppNav } from "@/components/app/AppNav";
import { PrivyProviders } from "@/components/app/PrivyProviders";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PrivyProviders>
      <AppNav />
      <main>{children}</main>
    </PrivyProviders>
  );
}
