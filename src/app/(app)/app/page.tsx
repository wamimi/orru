import type { Metadata } from "next";
import { DashboardScreen } from "@/components/app/DashboardScreen";

export const metadata: Metadata = {
  title: "Income workspace",
  description: "Review income, issue a statement, and manage sharing.",
};

export default function DashboardPage() {
  return <DashboardScreen />;
}
