import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(safe);
}

function parseDateForDisplay(date: string | Date) {
  if (date instanceof Date) return date;
  const raw = String(date).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00`);
  }
  return new Date(raw);
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return '-';
  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
    }).format(parseDateForDisplay(date));
  } catch (e) {
    return '-';
  }
}

export function toDateInputValue(date: string | Date = new Date()) {
  const parsed = parseDateForDisplay(date);
  if (!Number.isFinite(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getStartOfMonthInputValue(date: string | Date = new Date()) {
  const parsed = parseDateForDisplay(date);
  if (!Number.isFinite(parsed.getTime())) return '';
  return toDateInputValue(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
}

export function generateTransactionNumber(prefix: string) {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000); // 4 digit random
  return `${prefix}-${year}${month}${day}-${random}`;
}

export function normalizeSearchText(input: unknown) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function matchesFreeSearch(rawQuery: unknown, parts: unknown[]) {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const tokens = q.split(' ').filter(Boolean);
  const haystack = normalizeSearchText(
    (parts || [])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
      .map((v) => String(v))
      .join(' ')
  );
  return tokens.every((t) => haystack.includes(t));
}
