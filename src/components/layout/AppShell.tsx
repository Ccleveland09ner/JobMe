/**
 * Frame for signed-in screens: skip link, header, and the single <main>
 * landmark. Used by the dashboard and interview layouts, so pages render
 * content only and never a second <main>.
 */

import type { ReactNode } from "react";

import { AppHeader } from "./AppHeader";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>
      <AppHeader />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </>
  );
}
