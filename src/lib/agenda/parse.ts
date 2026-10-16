/**
 * Finds EXPLICIT dates in pasted/OCR'd agenda text. It never guesses a missing date or year:
 * a line without a complete date becomes an item with no due date, and day/month order is flagged when ambiguous.
 */
export interface ProposedItem { title: string; dueOn: string | null; sourceLine: string; ambiguous: boolean }

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, janvier: 1, feb: 2, february: 2, fév: 2, fevrier: 2, février: 2, mar: 3, march: 3, mars: 3, apr: 4, april: 4, avr: 4, avril: 4,
  may: 5, mai: 5, jun: 6, june: 6, juin: 6, jul: 7, july: 7, juil: 7, juillet: 7, aug: 8, august: 8, aout: 8, août: 8,
  sep: 9, sept: 9, september: 9, septembre: 9, oct: 10, october: 10, octobre: 10, nov: 11, november: 11, novembre: 11, dec: 12, december: 12, déc: 12, décembre: 12, decembre: 12,
};

const valid = (y: number, m: number, d: number) => {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

interface Found { dueOn: string; ambiguous: boolean; match: string }
function findDate(line: string): Found | null {
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(line);
  if (m && valid(+m[1]!, +m[2]!, +m[3]!)) return { dueOn: iso(+m[1]!, +m[2]!, +m[3]!), ambiguous: false, match: m[0] };
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-zéûôàç]{3,10})\.?,?\s+(\d{4})\b/.exec(line);
  if (m && MONTHS[m[2]!.toLowerCase()] && valid(+m[3]!, MONTHS[m[2]!.toLowerCase()]!, +m[1]!)) return { dueOn: iso(+m[3]!, MONTHS[m[2]!.toLowerCase()]!, +m[1]!), ambiguous: false, match: m[0] };
  m = /\b([A-Za-zéûôàç]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/.exec(line);
  if (m && MONTHS[m[1]!.toLowerCase()] && valid(+m[3]!, MONTHS[m[1]!.toLowerCase()]!, +m[2]!)) return { dueOn: iso(+m[3]!, MONTHS[m[1]!.toLowerCase()]!, +m[2]!), ambiguous: false, match: m[0] };
  m = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/.exec(line);
  if (m) {
    const a = +m[1]!, b = +m[2]!, y = +m[3]!;
    if (valid(y, b, a)) return { dueOn: iso(y, b, a), ambiguous: a <= 12 && b <= 12 && a !== b, match: m[0] }; // read as day/month/year; flagged when it could be month/day
    if (valid(y, a, b)) return { dueOn: iso(y, a, b), ambiguous: true, match: m[0] };
  }
  return null;
}

export function parseAgenda(text: string, max = 30): ProposedItem[] {
  const out: ProposedItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•\d.)\s]+(?=\S)/, (p) => (/\d{4}/.test(p) ? p : ""));
    if (line.length < 4) continue;
    const f = findDate(line);
    const title = (f ? line.replace(f.match, "") : line).replace(/^[\s:–—-]+|[\s:–—-]+$/g, "").replace(/\s{2,}/g, " ").slice(0, 160);
    if (title.length < 3) continue;
    out.push({ title, dueOn: f?.dueOn ?? null, sourceLine: raw.trim().slice(0, 300), ambiguous: f?.ambiguous ?? false });
    if (out.length >= max) break;
  }
  return out;
}
