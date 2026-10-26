"use client";

/**
 * The DOM layer over the canvas: the route's content and the single <main>.
 * How a page sits over the scene depends on its layout (layoutFor). At the
 * desk the user clicks the 3D objects; hidden twin buttons serve the keyboard.
 */

import { usePathname, useSearchParams } from "next/navigation";
import { useRef, type ReactNode } from "react";

import { buttonClasses } from "@/components/ui/Button";

import { useBuilding, useShow3D } from "./BuildingProvider";
import { domVisible } from "./heldMachine";
import { useCameraInset, useDeskActions, useHeldContent, useHeldFromRoute, useRouteHeadingFocus } from "./stationEffects";
import { clipboardWidth, heldFor, layoutFor, type Layout } from "./stationLayout";

export function StationLayer({ children }: { children: ReactNode }) {
  const building = useBuilding();
  const show3D = useShow3D();
  const pathname = usePathname();
  const search = useSearchParams();
  const main = useRef<HTMLElement>(null);
  const layout = layoutFor(pathname);
  const routeHeld = heldFor(pathname, search.get("open"));
  const walking = building !== null && building.state.target !== null && !building.state.returning;

  useRouteHeadingFocus(main, pathname, routeHeld);
  useHeldFromRoute(layout, routeHeld);
  useDeskActions();
  const heldContent = useHeldContent(routeHeld, children);
  useCameraInset(main, layout === "panel" || layout === "clipboard");

  const fade = `transition-opacity duration-300 ${walking ? "pointer-events-none opacity-0" : "opacity-100"}`;

  const held = building?.held;
  if (layout === "held") {
    // Without the building (no provider) the page simply renders.
    const showHeld = !building || (held !== undefined && domVisible(held) && held.held !== "notepad");
    const content = !building ? children : held?.phase === "closing" ? heldContent : children;
    const resting = !building || held?.phase === "resting";
    return (
      <main id="main" ref={main} className={fade}>
        {showHeld ? (
          <div className="fixed inset-0 z-10 flex overflow-y-auto px-2 py-4 sm:px-6 sm:py-8">
            {/* Auto margins, not flex centring, so tall content stays scrollable. */}
            <div className="m-auto flex w-full justify-center">{content}</div>
          </div>
        ) : (
          <DeskTwins
            disabled={!resting}
            visible={show3D === false}
            onPoint={(name) => building?.setHovered(name)}
            onActivate={(name) => building?.activate(name)}
          />
        )}
      </main>
    );
  }

  const frame: Record<Exclude<Layout, "held">, string> = {
    overlay: "relative z-10 flex min-h-dvh flex-1 flex-col",
    clipboard: `fixed inset-x-0 bottom-0 z-10 max-h-[70vh] overflow-y-auto px-3 pt-4 [scrollbar-width:thin] md:inset-y-0 md:left-auto md:right-6 md:max-h-none md:px-2 md:py-6 ${clipboardWidth(pathname)}`,
    // Click-through to the 3D board; only the pinned controls take the pointer.
    board: "pointer-events-none fixed inset-0 z-10",
    room: "pointer-events-none fixed inset-0 z-10",
    panel:
      "fixed inset-x-0 bottom-0 z-10 max-h-[62vh] overflow-y-auto rounded-t-2xl border border-line bg-surface/95 shadow-xl backdrop-blur-sm md:inset-y-4 md:left-auto md:right-4 md:max-h-none md:w-[min(40rem,48vw)] md:rounded-2xl",
  };

  return (
    <main id="main" ref={main} className={`${frame[layout]} ${fade}`}>
      {children}
    </main>
  );
}

/** Desk actions, in the order the objects sit. */
const DESK_ACTIONS: { name: string; label: string }[] = [
  { name: "ledger", label: "Open the ledger: every interview, word for word, and your progress" },
  { name: "clipboard", label: "Pick up the clipboard: start an interview" },
  { name: "reports", label: "Open the reports folder: summaries, feedback and rewrites" },
  { name: "settings", label: "Go to the settings notice board" },
];

/** Hidden buttons for the desk objects; focus lights up the object. Shown without 3D. */
function DeskTwins({
  disabled,
  visible,
  onPoint,
  onActivate,
}: {
  disabled: boolean;
  visible: boolean;
  onPoint: (name: string | null) => void;
  onActivate: (name: string) => void;
}) {
  return (
    <div className={visible ? "fixed inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-5" : "sr-only"}>
      <h1 className="sr-only">Front desk</h1>
      <nav aria-label="On the front desk" className="flex flex-wrap justify-center gap-2">
        {DESK_ACTIONS.map((a) => (
          <button
            key={a.name}
            type="button"
            disabled={disabled}
            onFocus={() => onPoint(a.name)}
            onBlur={() => onPoint(null)}
            onClick={() => onActivate(a.name)}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            {a.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
