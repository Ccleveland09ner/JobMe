/** A timestamp in the viewer's locale and time zone (may differ from the server render). */

const FORMATS = {
  date: { dateStyle: "medium" },
  dateTime: { dateStyle: "medium", timeStyle: "short" },
  /** Month and day, for a folder tab. */
  short: { month: "short", day: "numeric" },
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
