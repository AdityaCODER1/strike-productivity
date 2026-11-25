/**
 * Format a Date as local YYYY-MM-DD so days match the user's phone timezone.
 */
export function toDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD local date key into a local noon Date object (avoids DST drift).
 */
export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

/**
 * Format a dateKey for friendly iOS headers, e.g. "Today", "Yesterday", or "Mon, Nov 23".
 */
export function formatDateHeading(dateKey: string, todayKey: string = toDateKey()): string {
  if (dateKey === todayKey) return 'Today';

  const today = parseDateKey(todayKey);
  const target = parseDateKey(dateKey);
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';

  return target.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: target.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Shift a YYYY-MM-DD local date key by a number of days (DST-safe via local noon).
 */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const target = parseDateKey(dateKey);
  target.setDate(target.getDate() + days);
  return toDateKey(target);
}

/**
 * Return tomorrow's local YYYY-MM-DD date key.
 */
export function getTomorrowDateKey(now: Date = new Date()): string {
  return addDaysToDateKey(toDateKey(now), 1);
}

/**
 * Full header date subtitle like "Monday, Nov 23".
 */
export function formatFullDateSubtitle(dateKey: string = toDateKey()): string {
  const target = parseDateKey(dateKey);
  return target.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Compact weekday + date label like "Thu, Nov 26" for section headers.
 */
export function formatShortWeekdayDate(dateKey: string): string {
  const target = parseDateKey(dateKey);
  return target.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format timestamp into crisp 12h time e.g. "2:14 PM".
 */
export function formatTimeShort(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Generate a collision-resistant local/Firestore ID.
 */
export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
