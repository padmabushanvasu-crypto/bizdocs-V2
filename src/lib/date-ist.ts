// Pure IST (Asia/Kolkata) date helpers. All dates are 'YYYY-MM-DD' strings and
// all month/day math is done on the strings — never via toISOString(), which
// converts to UTC and shifts IST dates by a day.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const istDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const istTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const pad2 = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Today's date in IST as 'YYYY-MM-DD'. */
export function todayIST(now: Date = new Date()): string {
  return istDateFmt.format(now);
}

/** Current IST wall-clock as 'DD-Mon-YYYY HH:mm IST' (report "Generated" stamps). */
export function nowStampIST(now: Date = new Date()): string {
  return `${formatDateIN(todayIST(now))} ${istTimeFmt.format(now)} IST`;
}

/** 'YYYY-MM' -> first and last day of that month. Throws on malformed input. */
export function monthRange(month: string): { from: string; to: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error(`monthRange: expected 'YYYY-MM', got '${month}'`);
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) throw new Error(`monthRange: invalid month in '${month}'`);
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${pad2(daysInMonth(year, mon))}` };
}

/** 'YYYY-MM' of the month before the given 'YYYY-MM'. */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
}

/** Start ('YYYY-04-01') of the Indian financial year containing `today` (default: today in IST). */
export function fyStartIST(today: string = todayIST()): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return `${month >= 4 ? year : year - 1}-04-01`;
}

/** 'YYYY-MM-DD' -> '01-Oct-2026'. Returns the input unchanged if it is not a plain date. */
export function formatDateIN(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  if (!m) return date ?? "";
  return `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}`;
}
