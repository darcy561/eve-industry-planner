import { format, parse } from "date-fns";

/**
 * `YYYY-MM` is how the archive names a month everywhere — documents, filters and
 * the API — so the three shapes it arrives in convert here.
 */

export const MONTH_FORMAT = "yyyy-MM";

/** From a stored `{year, month}`. */
export function monthKey(row) {
  const year = Number(row?.year ?? 0);
  const month = Number(row?.month ?? 0);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** From a date a picker holds; "" for no date. */
export function monthKeyFromDate(date) {
  return date ? format(date, MONTH_FORMAT) : "";
}

/** To a date a picker can hold; null for no month. */
export function monthKeyToDate(wire) {
  return wire ? parse(wire, MONTH_FORMAT, new Date()) : null;
}

/** For reading: a dash when the archive never set one. */
export function monthKeyOrDash(row) {
  if (!Number(row?.year ?? 0) || !Number(row?.month ?? 0)) return "—";
  return monthKey(row);
}
