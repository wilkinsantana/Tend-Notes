import DOMPurify from 'dompurify';
import { explainDiagramError } from './diagramSource';

type Mermaid = typeof import('mermaid').default;
export interface DiagramTheme { signature: string; dark: boolean; font: string; variables: Record<string, string> }
export type DiagramResult = { ok: true; svg: string } | { ok: false; message: string };

// Mermaid is a separate chunk: it loads only when a note actually contains a diagram.
let engine: Promise<Mermaid> | null = null;
const loadEngine = () => engine ??= import('mermaid').then(module => module.default).catch(error => { engine = null; throw error; });

const colors = {
  paper: 'var(--paper, #15201c)', ink: 'var(--ink, #e6efea)', wash: 'var(--wash, #1d2622)', accent: 'var(--accent, #66b798)',
};
const expressions: Record<string, string> = {
  background: colors.paper,
  primaryColor: `color-mix(in srgb, ${colors.accent} 16%, ${colors.paper})`,
  primaryTextColor: colors.ink,
  primaryBorderColor: colors.accent,
  secondaryColor: `color-mix(in srgb, ${colors.ink} 8%, ${colors.paper})`,
  secondaryTextColor: colors.ink,
  secondaryBorderColor: `color-mix(in srgb, ${colors.ink} 45%, ${colors.paper})`,
  tertiaryColor: colors.wash,
  tertiaryTextColor: colors.ink,
  tertiaryBorderColor: `color-mix(in srgb, ${colors.ink} 35%, ${colors.paper})`,
  lineColor: `color-mix(in srgb, ${colors.ink} 72%, ${colors.paper})`,
  textColor: colors.ink,
  noteBkgColor: `color-mix(in srgb, ${colors.accent} 10%, ${colors.wash})`,
  noteTextColor: colors.ink,
  noteBorderColor: `color-mix(in srgb, ${colors.accent} 50%, ${colors.paper})`,
  edgeLabelBackground: colors.paper,
  clusterBkg: colors.wash,
  clusterBorder: `color-mix(in srgb, ${colors.ink} 30%, ${colors.paper})`,
  titleColor: colors.ink,
  actorBkg: `color-mix(in srgb, ${colors.accent} 16%, ${colors.paper})`,
  actorBorder: colors.accent,
  actorTextColor: colors.ink,
  actorLineColor: `color-mix(in srgb, ${colors.ink} 55%, ${colors.paper})`,
  signalColor: colors.ink,
  signalTextColor: colors.ink,
  labelBoxBkgColor: colors.wash,
  labelBoxBorderColor: colors.accent,
  labelTextColor: colors.ink,
  loopTextColor: colors.ink,
  activationBkgColor: `color-mix(in srgb, ${colors.accent} 22%, ${colors.paper})`,
  activationBorderColor: colors.accent,
  sequenceNumberColor: colors.paper,
};
const fallback = '#808080';

let canvas: CanvasRenderingContext2D | null | undefined;
function toHex(computed: string): string {
  canvas ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!canvas) return fallback;
  canvas.clearRect(0, 0, 1, 1);
  canvas.fillStyle = '#010203'; canvas.fillStyle = computed; // an unparseable value keeps the sentinel
  canvas.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
  if (a === 0) return fallback;
  return '#' + [r, g, b].map(value => value.toString(16).padStart(2, '0')).join('');
}
/** Read the live Tend tokens beneath `scope`; the browser resolves var() and color-mix() into plain hex for Mermaid. */
export function readDiagramTheme(scope: HTMLElement): DiagramTheme {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0';
  scope.append(probe);
  try {
    const variables: Record<string, string> = {};
    for (const [name, expression] of Object.entries(expressions)) {
      probe.style.color = ''; probe.style.color = expression;
      variables[name] = toHex(getComputedStyle(probe).color);
    }
    const [r, g, b] = [1, 3, 5].map(i => parseInt(variables.background.slice(i, i + 2), 16));
    const dark = (0.2126 * r + 0.7152 * g + 0.0722 * b) < 140;
    const font = getComputedStyle(scope).fontFamily || 'system-ui, sans-serif';
    return { signature: `${dark}|${font}|${Object.values(variables).join('')}`, dark, font, variables };
  } finally { probe.remove(); }
}

const cache = new Map<string, DiagramResult>();
const cacheKey = (source: string, theme: DiagramTheme) => `${theme.signature}\n${source}`;
/** Synchronous hit so unchanged diagrams do not flicker while the rest of a note is edited. */
export const cachedDiagram = (source: string, theme: DiagramTheme) => cache.get(cacheKey(source, theme));
let counter = 0;
const cleanSvg = (svg: string) => DOMPurify.sanitize(svg, {
  USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['style'], FORBID_TAGS: ['script', 'foreignObject', 'a', 'image'], ALLOW_DATA_ATTR: false,
});

/** Render one Mermaid source to inline SVG. Resolves with a plain-language failure rather than rejecting on bad diagrams. */
export async function renderDiagram(source: string, theme: DiagramTheme): Promise<DiagramResult> {
  const key = cacheKey(source, theme), hit = cache.get(key);
  if (hit) return hit;
  let result: DiagramResult, transient = false;
  const id = `notes-diagram-${++counter}`;
  try {
    const mermaid = await loadEngine();
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', theme: 'base', darkMode: theme.dark, fontFamily: theme.font,
      themeVariables: { ...theme.variables, darkMode: theme.dark, fontFamily: theme.font }, htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: true }, sequence: { useMaxWidth: true }, maxTextSize: 20000, maxEdges: 300, logLevel: 'fatal',
    });
    await mermaid.parse(source);
    const { svg } = await mermaid.render(id, source);
    const clean = cleanSvg(svg);
    result = clean.includes('<svg') ? { ok: true, svg: clean } : { ok: false, message: 'This diagram could not be drawn.' };
  } catch (error) {
    transient = error instanceof Error && /dynamically imported|Importing a module script failed|error loading dynamically/i.test(error.message);
    result = { ok: false, message: transient ? 'This diagram could not be loaded. Check your connection and reopen the note.' : explainDiagramError(error) };
  } finally { document.getElementById(id)?.remove(); document.getElementById(`d${id}`)?.remove(); }
  if (transient) return result;
  if (cache.size >= 60) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
