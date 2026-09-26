import { EMOTIONS } from '../poco/emotions';

/**
 * What Poco picked up in a moment, as plain words: "They looked happy". In
 * Social Mode Poco faces the other person, so "they" is that person.
 */
export function noticedNote(feeling: string): string {
  if (feeling === 'neutral') return 'No strong feeling showing';
  const label = EMOTIONS.find((e) => e.id === feeling)?.label.toLowerCase();
  return label ? `They looked ${label}` : 'Noticed something';
}

export function notesLabel(n: number): string {
  return n === 1 ? '1 note' : `${n} notes`;
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
