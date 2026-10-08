/** Pure helpers for Mermaid fences. Nothing here imports Mermaid, so Markdown rendering stays light. */
export const maxDiagramChars = 20000;
export const maxDiagramsPerNote = 12;
const firstLine = /^(?:(?:graph|flowchart)[ \t]+(?:TB|TD|BT|RL|LR)(?:[ \t]*;)?|flowchart-elk(?:[ \t]+(?:TB|TD|BT|RL|LR))?|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|gantt|pie(?:[ \t]+(?:showData|title\b.*))*|mindmap|timeline|journey|gitGraph(?:[ \t]+(?:TB|LR|BT)[ \t]*:)?|quadrantChart|requirementDiagram|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|kanban|architecture(?:-beta)?|radar(?:-beta)?)[ \t]*$/;
/** First line that names the diagram, skipping blank lines, %% comments/directives and a leading --- front matter block. */
export function diagramHeader(text: string): string | null {
  const lines = text.split(/\r?\n/);
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index++;
  if (lines[index]?.trim() === '---') {
    const close = lines.findIndex((line, i) => i > index && line.trim() === '---');
    if (close < 0) return null;
    index = close + 1;
  }
  for (; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line || line.startsWith('%%')) continue;
    return line;
  }
  return null;
}
/** A fence is a diagram when tagged `mermaid`, or untagged and opening with a Mermaid diagram keyword. */
export function isDiagramFence(lang: string | undefined, text: string): boolean {
  if (text.length > maxDiagramChars || !text.trim()) return false;
  const tag = (lang ?? '').trim().toLowerCase();
  if (tag === 'mermaid') return true;
  if (tag) return false;
  const header = diagramHeader(text);
  return header !== null && firstLine.test(header);
}
export const diagramStarter = '```mermaid\ngraph TD\n  A[Start] --> B{Choice}\n  B -->|Yes| C[Do it]\n  B -->|No| D[Skip]\n```\n';
/** Plain-language note from a Mermaid parse failure. Never throws and never returns an empty string. */
export function explainDiagramError(error: unknown): string {
  const raw = (error instanceof Error ? error.message : typeof error === 'string' ? error : (error as {str?: unknown} | null)?.str as string | undefined) ?? '';
  const message = String(raw).replace(/\r/g, '').trim();
  const line = /(?:on )?line (\d+)/i.exec(message)?.[1];
  const lines = message.split('\n').map(item => item.trim()).filter(Boolean);
  let detail = lines.at(-1) ?? '';
  if (/^No diagram type detected|UnknownDiagramError/i.test(message)) detail = 'the first line should name a diagram, such as graph TD or sequenceDiagram.';
  else {
    const found = /got '([^']+)'/.exec(detail)?.[1];
    if (found && /^Expecting /.test(detail)) detail = detail.length > 110 ? `unexpected ${found}.` : detail;
    else if (/^Parse error on line \d+:?$/i.test(detail) || !detail) detail = 'check the spelling and arrows around it.';
  }
  detail = detail.replace(/\s+/g, ' ').slice(0, 220);
  if (!/[.!?]$/.test(detail)) detail += '.';
  return line ? `This diagram has a mistake on line ${line}: ${detail}` : `This diagram has a mistake: ${detail}`;
}
