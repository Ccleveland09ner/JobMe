import { AppShell } from "@/components/layout/AppShell";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return <AppShell>{children}</AppShell>;
}
