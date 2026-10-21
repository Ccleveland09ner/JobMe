/**
 * A page face at a document's logical size, for BookSlider: paper, ruled or
 * ledger paper, a leather cover, endpapers, or the folder's manila flap. The
 * geometry is exported so pagination knows exactly how much fits.
 */

import type { CSSProperties, ReactNode } from "react";

export type PageFace = "paper" | "ruled" | "ledger" | "cover" | "endpaper" | "flap";

/** One document page, in logical px. */
export const DOC_PAGE = {
  width: 420,
  height: 580,
  padX: 30,
  padTop: 26,
  padBottom: 20,
  /** The running head and the page number lines. */
  head: 22,
  foot: 20,
  /** Space between blocks on a page. */
  gap: 14,
} as const;

/** Height the body of a page has for content, with a running head and a page number. */
export const DOC_BODY_HEIGHT = DOC_PAGE.height - DOC_PAGE.padTop - DOC_PAGE.padBottom - DOC_PAGE.head - DOC_PAGE.foot;
export const DOC_BODY_WIDTH = DOC_PAGE.width - DOC_PAGE.padX * 2;

const FRAME: CSSProperties = {
  padding: `${DOC_PAGE.padTop}px ${DOC_PAGE.padX}px ${DOC_PAGE.padBottom}px`,
};

export function DocumentPage({
  face = "paper",
  running,
  number,
  className = "",
  children,
}: {
  face?: PageFace;
  /** The running head: what this page belongs to. */
  running?: ReactNode;
  /** The printed page number. */
  number?: number | string;
  className?: string;
  children?: ReactNode;
}) {
  const bare = face === "cover" || face === "endpaper";
  return (
    <div className={`doc-page doc-page--${face} ${className}`.trim()} style={bare ? undefined : FRAME}>
      {!bare && (
        <div className="doc-page__head" style={{ height: DOC_PAGE.head }}>
          {running}
        </div>
      )}
      <div className="doc-page__body" style={bare ? undefined : { gap: DOC_PAGE.gap }}>
        {children}
      </div>
      {!bare && (
        <div className="doc-page__foot" style={{ height: DOC_PAGE.foot }}>
          {number}
        </div>
      )}
    </div>
  );
}
