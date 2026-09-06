import { NOTE_TEMPLATES } from './templates';

export type DailyNote = Readonly<{ day: string; name: string; content: string }>;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/** A calendar day belongs to the person opening Notes, never UTC. */
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Portable Markdown for one local calendar day. */
export function dailyNote(date = new Date()): DailyNote {
  const day = localDay(date);
  const plan = NOTE_TEMPLATES.find(template => template.id === 'daily-plan');
  if (!plan) throw new Error('The daily plan is unavailable.');
  return {
    day,
    name: `Daily ${day}.md`,
    content: plan.content.replace(/^# Daily plan$/m, `# Daily ${day}`),
  };
}
