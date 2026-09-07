export interface EditorSelection { start: number; end: number }
export interface EditorHistoryResult extends EditorSelection { body: string }

interface Edit {
  at: number;
  removed: string;
  inserted: string;
  before: EditorSelection;
  after: EditorSelection;
}

interface Group {
  edits: Edit[];
  key: string | null;
  at: number;
  cost: number;
}

const clamp = (value: number, length: number) => Math.max(0, Math.min(length, Math.trunc(value)));
const selection = (value: EditorSelection, length: number): EditorSelection => {
  const start = clamp(value.start, length), end = clamp(value.end, length);
  return { start: Math.min(start, end), end: Math.max(start, end) };
};

function difference(before: string, after: string) {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  return {
    at: prefix,
    removed: before.slice(prefix, before.length - suffix),
    inserted: after.slice(prefix, after.length - suffix),
  };
}

/** Bounded, body-only editor history. Metadata stays owned by the current note. */
export class EditorHistory {
  private past: Group[] = [];
  private future: Group[] = [];
  private retained = 0;
  private bodyValue: string;

  constructor(body: string, private readonly maxGroups = 120, private readonly maxUnits = 8 * 1024 * 1024) {
    this.bodyValue = body;
  }

  get body() { return this.bodyValue; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  sync(body: string) {
    if (body === this.bodyValue) return;
    this.bodyValue = body;
    this.past = []; this.future = []; this.retained = 0;
  }

  record(next: string, beforeSelection: EditorSelection | null, afterSelection: EditorSelection, key: string | null = null, now = Date.now()) {
    if (next === this.bodyValue) return false;
    const change = difference(this.bodyValue, next);
    const before = beforeSelection ? selection(beforeSelection, this.bodyValue.length) : { start: change.at, end: change.at + change.removed.length };
    const after = selection(afterSelection, next.length);
    const edit: Edit = { ...change, before, after };
    if (this.future.length) {
      this.retained -= this.future.reduce((total, group) => total + group.cost, 0);
      this.future = [];
    }
    const previous = this.past.at(-1);
    const joins = !!key && previous?.key === key && previous.edits.length < 500 && previous.cost < 65536 && now - previous.at <= 1000 &&
      (key.startsWith('composition:') || (previous.edits.at(-1)?.after.start === before.start && previous.edits.at(-1)?.after.end === before.end));
    const cost = change.removed.length + change.inserted.length;
    if (joins && previous) { previous.edits.push(edit); previous.at = now; previous.cost += cost; }
    else this.past.push({ edits: [edit], key, at: now, cost });
    this.retained += cost;
    this.bodyValue = next;
    while (this.past.length > this.maxGroups || (this.retained > this.maxUnits && this.past.length > 0)) {
      this.retained -= this.past.shift()!.cost;
    }
    return true;
  }

  undo(): EditorHistoryResult | null {
    const group = this.past.pop();
    if (!group) return null;
    let body = this.bodyValue;
    for (let index = group.edits.length - 1; index >= 0; index -= 1) {
      const edit = group.edits[index];
      if (body.slice(edit.at, edit.at + edit.inserted.length) !== edit.inserted) return this.invalidate(body);
      body = body.slice(0, edit.at) + edit.removed + body.slice(edit.at + edit.inserted.length);
    }
    this.bodyValue = body; this.future.push(group);
    return { body, ...group.edits[0].before };
  }

  redo(): EditorHistoryResult | null {
    const group = this.future.pop();
    if (!group) return null;
    let body = this.bodyValue;
    for (const edit of group.edits) {
      if (body.slice(edit.at, edit.at + edit.removed.length) !== edit.removed) return this.invalidate(body);
      body = body.slice(0, edit.at) + edit.inserted + body.slice(edit.at + edit.removed.length);
    }
    this.bodyValue = body; this.past.push(group);
    return { body, ...group.edits.at(-1)!.after };
  }

  private invalidate(body: string): null {
    this.bodyValue = body; this.past = []; this.future = []; this.retained = 0; return null;
  }
}
