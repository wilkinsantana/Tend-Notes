/** Formatted Markdown presentation with the existing Notes history as its sole Undo owner. */
import { Annotation, Compartment, EditorSelection, EditorState, StateEffect, StateField, Transaction } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, drawSelection, keymap } from '@codemirror/view';
import { defaultKeymap, insertNewline } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { markdownNewline } from './keyboard';
import type { EditorSelection as Selection } from './editorHistory';
import type { TextMatch } from './find';

const external = Annotation.define<boolean>();
let instanceSequence = 0;
const searchMarks = StateEffect.define<DecorationSet>();
const searchField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) if (effect.is(searchMarks)) value = effect.value;
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});
function continueMarkdown(view: EditorView) {
  if (view.state.readOnly || view.composing) return false;
  const selected = view.state.selection.main;
  const edit = markdownNewline(view.state.doc.toString(), selected.from, selected.to);
  if (!edit) return false;
  view.dispatch({ changes: { from: edit.from, to: edit.to, insert: edit.text },
    selection: EditorSelection.cursor(edit.from + edit.text.length), userEvent: 'input' });
  return true;
}
export interface WritingChange { body: string; before: Selection; after: Selection; key: string | null }
export interface WritingOptions {
  body: string;
  readOnly?: boolean;
  onChange: (change: WritingChange) => void;
  onUndo: () => void;
  onRedo: () => void;
}
const range = (selection: { from: number; to: number }): Selection => ({ start: selection.from, end: selection.to });
const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.7em', fontWeight: '650', lineHeight: '1.5' },
  { tag: tags.heading2, fontSize: '1.4em', fontWeight: '650', lineHeight: '1.5' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontSize: '1.15em', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--accent,#66b798)', textDecoration: 'underline' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono,monospace)', background: 'var(--wash,#1d2622)' },
  { tag: tags.quote, color: 'var(--soft,#93a49c)', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: 'var(--soft,#93a49c)' },
]);
const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--ink,#d8e3df)', backgroundColor: 'transparent', fontSize: '14px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-sans,system-ui,sans-serif)', lineHeight: '1.9', overflow: 'auto' },
  '.cm-content': { padding: '24px', caretColor: 'var(--accent,#66b798)' },
  '.cm-line': { padding: '0' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { background: 'color-mix(in srgb,var(--accent,#66b798) 25%,transparent)' },
  '.notes-find-match': { background: 'color-mix(in srgb,var(--accent,#66b798) 22%,transparent)', borderRadius: '2px' },
  '.notes-find-active': { background: 'color-mix(in srgb,var(--accent,#66b798) 45%,transparent)', outline: '1px solid var(--accent,#66b798)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent,#66b798)' },
});

/** One source of bytes and one Undo owner: the existing Notes session/history. */
export class WritingSurface {
  readonly view: EditorView;
  private access = new Compartment();
  private identity = ++instanceSequence;
  private composition = 0;
  private composing = false;
  private accessConfig(value: boolean) {
    return [EditorState.readOnly.of(value), EditorView.editable.of(!value), EditorView.contentAttributes.of({ 'aria-readonly': String(value) })];
  }
  constructor(parent: HTMLElement, options: WritingOptions) {
    const undo = (redo = false) => { if (!this.view.state.readOnly) (redo ? options.onRedo : options.onUndo)(); return true; };
    this.view = new EditorView({ parent, state: EditorState.create({ doc: options.body, extensions: [
      this.access.of(this.accessConfig(!!options.readOnly)),
      searchField,
      EditorState.allowMultipleSelections.of(false),
      EditorView.contentAttributes.of({ 'aria-label': 'Formatted Markdown', spellcheck: 'true' }),
      EditorView.lineWrapping, drawSelection(), markdown({addKeymap:false,completeHTMLTags:false,pasteURLAsLink:false}), syntaxHighlighting(highlight), theme,
      EditorState.transactionFilter.of(tr => tr.docChanged && tr.startState.readOnly && !tr.annotation(external) ? [] : tr),
      EditorView.domEventHandlers({
        keydown: event => {
          if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return false;
          const key = event.key.toLowerCase();
          if (key !== 'z' && key !== 'y') return false;
          event.preventDefault(); event.stopPropagation(); return undo(key === 'y' || event.shiftKey);
        },
        compositionstart: () => { this.composing = true; this.composition++; return false; },
        compositionend: () => { this.composing = false; return false; },
        beforeinput: event => {
          if (event.cancelable && !event.isComposing && ['insertLineBreak', 'insertParagraph'].includes(event.inputType) && continueMarkdown(this.view)) { event.preventDefault(); return true; }
          if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return false;
          event.preventDefault(); return undo(event.inputType === 'historyRedo');
        },
      }),
      keymap.of([
        { key: 'Enter', run: continueMarkdown },
        { key: 'Shift-Enter', run: insertNewline },
        ...defaultKeymap,
      ]),
      EditorView.updateListener.of(update => {
        const edits = update.transactions.filter(tr => tr.docChanged && !tr.annotation(external));
        if (!edits.length) return;
        const event = edits.at(-1)!.annotation(Transaction.userEvent);
        const key = this.composing || event?.startsWith('input.type.compose') ? `composition:${this.identity}:${this.composition}` : event === 'input.type' ? 'insertText' :
          event === 'delete.backward' ? 'deleteContentBackward' : event === 'delete.forward' ? 'deleteContentForward' : null;
        options.onChange({ body: update.state.doc.toString(), before: range(edits[0].startState.selection.main),
          after: range(update.state.selection.main), key });
      }),
    ] }) });
  }
  get value() { return this.body; }
  set value(value: string) { this.setBody(value); }
  get selectionStart() { return this.selection.start; }
  get selectionEnd() { return this.selection.end; }
  get readOnly() { return this.view.state.readOnly; }
  setSelectionRange(start: number, end: number) { this.select(start, end); }
  contains(target: EventTarget | null) { return target instanceof Node && this.view.contentDOM.contains(target); }
  setMatches(matches: TextMatch[], activeStart: number) {
    const length = this.view.state.doc.length;
    const ranges = matches.filter(match => match.start >= 0 && match.end <= length && match.end > match.start)
      .map(match => Decoration.mark({ class: match.start === activeStart ? 'notes-find-match notes-find-active' : 'notes-find-match' }).range(match.start, match.end));
    this.view.dispatch({ effects: searchMarks.of(Decoration.set(ranges, true)) });
  }
  get body() { return this.view.state.doc.toString(); }
  get selection() { return range(this.view.state.selection.main); }
  setBody(body: string, selection?: Selection) {
    const length = body.length;
    const selected = selection ?? this.selection;
    this.view.dispatch({ changes: body === this.body ? undefined : { from: 0, to: this.view.state.doc.length, insert: body },
      selection: EditorSelection.range(Math.max(0, Math.min(length, selected.start)), Math.max(0, Math.min(length, selected.end))),
      annotations: external.of(true) });
  }
  setReadOnly(value: boolean) { this.view.dispatch({ effects: this.access.reconfigure(this.accessConfig(value)) }); }
  select(start: number, end = start) {
    const length = this.view.state.doc.length;
    this.view.dispatch({ selection: EditorSelection.range(Math.max(0, Math.min(length, start)), Math.max(0, Math.min(length, end))), scrollIntoView: true });
  }
  focus() { this.view.focus(); }
  destroy() { this.view.destroy(); }
}
