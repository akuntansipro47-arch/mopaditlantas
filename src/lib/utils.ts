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

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return '-';
  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
    }).format(new Date(date));
  } catch (e) {
    return '-';
  }
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
