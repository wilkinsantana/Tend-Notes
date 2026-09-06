export type NoteTemplate = {
  id: string;
  name: string;
  description: string;
  content: string;
};

/** Built-in starting points stay ordinary, portable Markdown. */
export const NOTE_TEMPLATES: readonly NoteTemplate[] = [
  {
    id: 'grocery-list',
    name: 'Grocery list',
    description: 'A simple aisle-by-aisle shopping list.',
    content: `# Grocery list

## Produce
- [ ] [Quantity] Item

## Pantry
- [ ] [Quantity] Item

## Refrigerated
- [ ] [Quantity] Item

## Household
- [ ] [Quantity] Item
`,
  },
  {
    id: 'packing-list',
    name: 'Packing list',
    description: 'Keep the essentials together before you leave.',
    content: `# Packing list

## Essentials
- [ ] ID, tickets, and wallet
- [ ] Phone and charger

## Clothes
- [ ] [Item]

## Before leaving
- [ ] Lock up
- [ ] Check travel details
`,
  },
  {
    id: 'meeting-notes',
    name: 'Meeting notes',
    description: 'Capture the conversation, decisions, and follow-ups.',
    content: `# Meeting notes

**Date:** [Date]
**Attendees:** [Names]

## Agenda
- [ ] [Topic]

## Notes

## Decisions
- [ ] [Decision]

## Follow-up
- [ ] [Action] — [Owner]
`,
  },
  {
    id: 'daily-plan',
    name: 'Daily plan',
    description: 'Make space for what matters today.',
    content: `# Daily plan

## Top priorities
- [ ] [Priority]
- [ ] [Priority]
- [ ] [Priority]

## Schedule
- [ ] [Time] [Plan]

## Notes
`,
  },
  {
    id: 'project-plan',
    name: 'Project plan',
    description: 'Outline a goal, its milestones, and next steps.',
    content: `# Project plan

## Goal
[Describe the outcome]

## Milestones
- [ ] [Milestone]
- [ ] [Milestone]

## Next steps
- [ ] [Action] — [Owner]

## Notes
`,
  },
  {
    id: 'blank-checklist',
    name: 'Blank checklist',
    description: 'A clean list ready for your own steps.',
    content: `# Checklist

- [ ] [Item]
`,
  },
];
