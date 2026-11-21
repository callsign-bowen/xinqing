import { encourageMessages } from './messages.ts';

export function shanghaiDay(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Absolute day number avoids repeating notes around New Year and counts leap day normally. */
export function dailyEncouragement(date = new Date()): { day: string; text: string } {
  const day = shanghaiDay(date);
  const ordinal = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
  const index = ((ordinal % encourageMessages.length) + encourageMessages.length) % encourageMessages.length;
  return { day, text: encourageMessages[index] };
}
