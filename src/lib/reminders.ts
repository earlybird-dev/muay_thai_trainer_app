import { completedDays, dateKey, dayStatus, type TrainPlan } from './plans';
import type { SessionLog } from './storage';

/** Plans whose reminder time has passed today, on a training day that isn't done yet. Pure. */
export function remindersDue(plans: TrainPlan[], history: SessionLog[], now: Date): TrainPlan[] {
  const today = dateKey(now);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return plans.filter(
    (p) => !p.archived && p.reminder.enabled && hhmm >= p.reminder.time && dayStatus(p, today, today, completedDays(p, history)) === 'today',
  );
}

const KEY = 'mt.reminded';

/** Remember which plan reminders were shown today (per device). */
export function takeUnshown(plans: TrainPlan[], now: Date): TrainPlan[] {
  const today = dateKey(now);
  let shown: Record<string, string> = {};
  try {
    shown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    /* ignore */
  }
  const fresh = plans.filter((p) => shown[p.id] !== today);
  if (fresh.length) {
    for (const p of fresh) shown[p.id] = today;
    try {
      localStorage.setItem(KEY, JSON.stringify(shown));
    } catch {
      /* ignore */
    }
  }
  return fresh;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** System notification, via the service worker when available (needed on Android). */
export async function notify(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, icon: './icon.svg', badge: './icon.svg', tag: 'mt-training-reminder' };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    /* ignore */
  }
}
