import { AppShell } from "@/components/layout/AppShell";

export default function InterviewLayout({ children }: LayoutProps<"/interview">) {
  return <AppShell>{children}</AppShell>;
}
