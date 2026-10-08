import { test, expect } from 'bun:test';
import { diagramHeader, diagramStarter, explainDiagramError, isDiagramFence, maxDiagramChars } from '../src/diagramSource';

test('a fence tagged mermaid is always a diagram, whatever its first line', () => {
  expect(isDiagramFence('mermaid', 'graph TD\n  A-->B')).toBe(true);
  expect(isDiagramFence('Mermaid', 'anything at all')).toBe(true);
  expect(isDiagramFence('mermaid', '   \n')).toBe(false);
});

test('an untagged fence is a diagram only when it opens with a Mermaid diagram keyword', () => {
  for (const first of ['graph TD', 'graph LR;', 'flowchart TD', 'flowchart RL', 'sequenceDiagram', 'classDiagram', 'stateDiagram-v2', 'stateDiagram', 'erDiagram', 'gantt', 'pie', 'pie showData', 'pie title Pets', 'mindmap', 'timeline', 'journey', 'gitGraph', 'gitGraph LR:'])
    expect(isDiagramFence(undefined, `${first}\n  A --> B`)).toBe(true);
  expect(isDiagramFence('', '\n\n  graph TD\n  A-->B')).toBe(true);
  expect(isDiagramFence(undefined, '%% a note\n%%{init: {"theme":"dark"}}%%\nsequenceDiagram\nA->>B: hi')).toBe(true);
  expect(isDiagramFence(undefined, '---\ntitle: Plan\n---\nflowchart TD\nA-->B')).toBe(true);
});

test('ordinary code blocks stay code blocks', () => {
  expect(isDiagramFence(undefined, 'const graph = 1;\ngraph TD')).toBe(false);
  expect(isDiagramFence(undefined, 'graph\nnot a direction')).toBe(false);
  expect(isDiagramFence(undefined, 'pie is good with cream')).toBe(false);
  expect(isDiagramFence(undefined, 'timeline of events\n- one')).toBe(false);
  expect(isDiagramFence(undefined, 'gantt chart notes')).toBe(false);
  expect(isDiagramFence(undefined, 'npm install')).toBe(false);
  expect(isDiagramFence('js', 'graph TD\nA-->B')).toBe(false);
  expect(isDiagramFence('text', 'sequenceDiagram')).toBe(false);
  expect(isDiagramFence(undefined, '')).toBe(false);
  expect(isDiagramFence(undefined, '---\nunterminated\ngraph TD')).toBe(false);
});

test('huge sources are left as code', () => {
  expect(isDiagramFence('mermaid', 'graph TD\n' + 'A-->B\n'.repeat(maxDiagramChars))).toBe(false);
});

test('header lookup skips blanks, comments and front matter', () => {
  expect(diagramHeader('\n%% hi\n  graph TD')).toBe('graph TD');
  expect(diagramHeader('')).toBeNull();
  expect(diagramHeader('%% only comments')).toBeNull();
});

test('the starter block is itself a detected diagram', () => {
  const body = diagramStarter.replace(/^```mermaid\n/, '').replace(/```\n$/, '');
  expect(diagramStarter.startsWith('```mermaid\ngraph TD\n')).toBe(true);
  expect(isDiagramFence('mermaid', body)).toBe(true);
  expect(isDiagramFence(undefined, body)).toBe(true);
});

test('parse failures become one plain sentence with the line number', () => {
  const jison = new Error("Parse error on line 3:\n...B -->|Yes| C[Do\n----------------------^\nExpecting 'SQE', 'DOUBLECIRCLEEND', 'PE', '-)', 'STADIUMEND', 'SUBROUTINEEND', 'PIPE', 'CYLINDEREND', 'DIAMOND_STOP', 'TAGEND', 'TRAPEND', 'INVTRAPEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got 'EOF'");
  expect(explainDiagramError(jison)).toBe('This diagram has a mistake on line 3: unexpected EOF.');
  expect(explainDiagramError(new Error("Parse error on line 2:\n...A --> \n----^\nExpecting 'X', got 'Y'"))).toBe("This diagram has a mistake on line 2: Expecting 'X', got 'Y'.");
  expect(explainDiagramError(new Error('No diagram type detected matching given configuration for text: hello'))).toBe('This diagram has a mistake: the first line should name a diagram, such as graph TD or sequenceDiagram.');
  expect(explainDiagramError({ str: 'Parse error on line 4:\nbad', hash: {} })).toBe('This diagram has a mistake on line 4: bad.');
});

test('error text is never empty and never throws', () => {
  for (const value of [undefined, null, '', 42, {}, new Error('')]) {
    const text = explainDiagramError(value);
    expect(text.startsWith('This diagram has a mistake')).toBe(true);
    expect(text.length).toBeGreaterThan(30);
  }
});
