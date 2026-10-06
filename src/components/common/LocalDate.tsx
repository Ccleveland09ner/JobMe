/**
 * A timestamp in the viewer's own locale and time zone.
 *
 * The server renders in ITS time zone and the browser re-renders in the
 * user's, so the text can legitimately differ across hydration;
 * `suppressHydrationWarning` covers exactly this element's text and nothing
 * else. `dateTime` keeps the machine-readable value exact either way.
 */

const FORMATS = {
  date: { dateStyle: "medium" },
  dateTime: { dateStyle: "medium", timeStyle: "short" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export function LocalDate({
  iso,
  format = "date",
  className,
}: {
  iso: string;
  format?: keyof typeof FORMATS;
  className?: string;
}) {
  const date = new Date(iso);
  const text = Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, FORMATS[format]).format(date);
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
