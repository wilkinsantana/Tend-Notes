import katex from 'katex';
import DOMPurify from 'dompurify';

/** Bounded, local-only equation rendering. No trusted URLs, HTML or shared macros. */
export function renderFormula(source: string, display = false): string {
  if (source.length > 8192) throw new Error('Keep formulas under 8,192 characters.');
  const output = katex.renderToString(source, {
    output: 'mathml', displayMode: display, throwOnError: true,
    trust: false, strict: 'error', maxExpand: 1000, maxSize: 20,
  });
  return DOMPurify.sanitize(output, { USE_PROFILES: { mathMl: true }, ALLOW_DATA_ATTR: false });
}
