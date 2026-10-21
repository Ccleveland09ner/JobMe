"use client";

import { useRef, useState } from "react";

import Book, { type BookSliderHandle } from "@/components/ui/book-slider";
import { Button } from "@/components/ui/Button";
import { DocumentPage } from "@/components/ui/DocumentPage";

const SIZE = { width: 420, height: 580 };
const SHEET = { width: 440, height: 580 };

function Sample({ n }: { n: number }) {
  return (
    <>
      <h2 className="text-lg font-semibold text-ink">Page {n}</h2>
      <p className="text-sm leading-relaxed text-ink">
        A fixed-size page. Content that does not fit continues on the next page instead of making this one longer.
      </p>
    </>
  );
}

export function BookDemo() {
  const book: React.ReactNode[] = [
    <DocumentPage key="c" face="cover">
      <div className="flex h-full items-center justify-center">
        <span className="rounded-md border-2 border-ink bg-brass px-6 py-3 font-semibold uppercase tracking-widest text-ink">Ledger</span>
      </div>
    </DocumentPage>,
    ...Array.from({ length: 6 }, (_, i) => (
      <DocumentPage key={i} face="ledger" running="Sample" number={i + 1}>
        <Sample n={i + 1} />
      </DocumentPage>
    )),
    <DocumentPage key="b" face="cover" />,
  ];
  const folder: React.ReactNode[] = [
    <DocumentPage key="f" face="flap" running="File">
      <p className="text-sm text-ink">The inside flap of the folder.</p>
    </DocumentPage>,
    ...Array.from({ length: 5 }, (_, i) => (
      <DocumentPage key={i} running="Report" number={i + 1}>
        <Sample n={i + 1} />
      </DocumentPage>
    )),
  ];

  const sheets = useRef<BookSliderHandle>(null);
  const [name, setName] = useState("");
  // Rebuilding swaps in a fresh engine: listeners must not pile up.
  const [build, setBuild] = useState(0);
  const clipboard = [1, 2, 3].map((n) => (
    <DocumentPage key={n} running={`Sheet ${n} of 3`}>
      <label className="flex flex-col gap-1 text-sm text-ink">
        A field on sheet {n}
        <input value={name} onChange={(e) => setName(e.target.value)} className="border-b-2 border-ink/70 bg-transparent px-1 py-1" />
      </label>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => sheets.current?.prev()} disabled={n === 1}>
          Back
        </Button>
        <Button size="sm" onClick={() => sheets.current?.next()} disabled={n === 3}>
          Next
        </Button>
      </div>
    </DocumentPage>
  ));

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">Book</h2>
          <Button size="sm" variant="secondary" onClick={() => setBuild((b) => b + 1)}>
            Rebuild ({build})
          </Button>
        </div>
        <Book mode="book" pages={book} pageSize={SIZE} documentKey={`demo-book-${build}`} label="Sample book" reserveHeight={260} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-ink">Folder</h2>
        <Book mode="folder" pages={folder} pageSize={SIZE} documentKey="demo-folder" label="Sample folder" reserveHeight={260} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-ink">Clipboard</h2>
        <Book ref={sheets} mode="clipboard" pages={clipboard} pageSize={SHEET} documentKey="demo-sheets" label="Sample form" />
      </section>
    </>
  );
}
