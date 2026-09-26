import type { InteractSession } from '../app/AppProvider';
import { EMOTIONS } from '../poco/emotions';

export interface FeelingCount {
  feeling: string;
  count: number;
}

/** A correction meaning "Poco logged something but no one was there". */
export const NO_ONE = 'none';

/** The session's moments with the adult's corrections applied ("no one there" moments dropped). */
export function effectiveEvents(s: Pick<InteractSession, 'events' | 'feedback'>) {
  const fix = s.feedback?.corrections ?? {};
  return s.events
    .map((e) => (fix[e.at] ? { ...e, feeling: fix[e.at] } : e))
    .filter((e) => e.feeling !== NO_ONE);
}

/** How many of Poco's guesses were right, once the adult has reviewed the session. */
export function accuracy(s: InteractSession): { right: number; total: number } | null {
  if (!s.feedback || !s.events.length) return null;
  const wrong = s.events.filter((e) => s.feedback!.corrections[e.at]).length;
  return { right: s.events.length - wrong, total: s.events.length };
}

/** How many times each feeling came up, most first (ties keep the built-in order). */
export function countFeelings(events: { feeling: string }[]): FeelingCount[] {
  const counts = new Map<string, number>();
  events.forEach((e) => counts.set(e.feeling, (counts.get(e.feeling) ?? 0) + 1));
  const order = (id: string) => EMOTIONS.findIndex((e) => e.id === id);
  return [...counts.entries()]
    .map(([feeling, count]) => ({ feeling, count }))
    .sort((a, b) => b.count - a.count || order(a.feeling) - order(b.feeling));
}

export function minutesLabel(start: number, end: number): string {
  const min = Math.round((end - start) / 60000);
  return min < 1 ? 'under a minute' : min === 1 ? '1 min' : `${min} min`;
}

export function dayLabel(at: number, now = Date.now()): string {
  const d = new Date(at);
  const today = new Date(now);
  const yesterday = new Date(now - 86400000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
}

const WEEK = 7 * 86400000;

/**
 * One plain sentence comparing the last 7 days with the 7 before, about the
 * feeling whose count changed most. Null until both weeks have sessions.
 */
export function weeklyTrend(sessions: InteractSession[], now = Date.now()): string | null {
  const thisWeek = sessions.filter((s) => s.start > now - WEEK);
  const lastWeek = sessions.filter((s) => s.start <= now - WEEK && s.start > now - 2 * WEEK);
  if (!thisWeek.length || !lastWeek.length) return null;
  const count = (list: InteractSession[], id: string) =>
    list.reduce((n, s) => n + effectiveEvents(s).filter((e) => e.feeling === id).length, 0);
  let best: { label: string; now: number; before: number } | null = null;
  for (const e of EMOTIONS) {
    const a = count(thisWeek, e.id);
    const b = count(lastWeek, e.id);
    if (a !== b && (!best || Math.abs(a - b) > Math.abs(best.now - best.before))) {
      best = { label: e.label, now: a, before: b };
    }
  }
  if (!best) return 'This week looked a lot like last week.';
  const times = (n: number) => (n === 1 ? '1 time' : `${n} times`);
  return `${best.label} came up ${times(best.now)} this week, ${best.now > best.before ? 'up' : 'down'} from ${times(best.before)} last week.`;
}
