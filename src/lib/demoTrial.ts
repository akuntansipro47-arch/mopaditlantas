// Pembatasan mode demo: maksimal DEMO_TRIAL_WORKDAYS hari kerja terhitung sejak
// login demo pertama. Stempel waktu disimpan per perangkat di localStorage;
// setelah masa berakhir, mode demo terkunci di perangkat tersebut (login demo
// ditolak dan sesi demo yang masih aktif diputus).

const FIRST_LOGIN_KEY = 'demo_first_login_at';
export const DEMO_TRIAL_WORKDAYS = 7;

// Hari kerja dihitung Senin–Sabtu (Minggu tidak dihitung).
function isWorkday(date: Date): boolean {
  return date.getDay() !== 0;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export interface DemoTrialInfo {
  firstLoginAt: number;
  usedWorkdays: number;
  remainingWorkdays: number;
  expiresOn: Date;
  expired: boolean;
}

/** Catat waktu login demo pertama (hanya diisi sekali; tidak direset saat logout). */
export function markDemoFirstLogin(now: Date = new Date()): void {
  if (!localStorage.getItem(FIRST_LOGIN_KEY)) {
    localStorage.setItem(FIRST_LOGIN_KEY, String(now.getTime()));
  }
}

export function getDemoTrialInfo(now: Date = new Date()): DemoTrialInfo | null {
  const raw = localStorage.getItem(FIRST_LOGIN_KEY);
  const firstLoginAt = raw ? Number(raw) : NaN;
  if (!Number.isFinite(firstLoginAt)) return null;

  const start = startOfDay(new Date(firstLoginAt));
  const today = startOfDay(now);

  let used = 0;
  let expiresOn = today;
  const cursor = new Date(start);
  while (cursor <= today) {
    if (isWorkday(cursor)) used += 1;
    if (used <= DEMO_TRIAL_WORKDAYS) expiresOn = new Date(cursor);
    if (used > DEMO_TRIAL_WORKDAYS) break;
    cursor.setDate(cursor.getDate() + 1);
  }

  const expired = used > DEMO_TRIAL_WORKDAYS;
  const remaining = expired
    ? 0
    : DEMO_TRIAL_WORKDAYS - used + (isWorkday(today) ? 1 : 0);

  return {
    firstLoginAt,
    usedWorkdays: used,
    remainingWorkdays: remaining,
    expiresOn,
    expired,
  };
}

export function isDemoTrialExpired(now: Date = new Date()): boolean {
  return getDemoTrialInfo(now)?.expired === true;
}
