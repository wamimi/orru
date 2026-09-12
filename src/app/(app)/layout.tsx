import { AppNav } from "@/components/app/AppNav";
import { PrivyProviders } from "@/components/app/PrivyProviders";
import { WorkflowProgress } from "@/components/app/WorkflowProgress";

export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PrivyProviders>
      <div className="product-shell app-shell">
        <AppNav />
        <main className="app-main">
          <WorkflowProgress />
          {children}
        </main>
      </div>
    </PrivyProviders>
  );
}
