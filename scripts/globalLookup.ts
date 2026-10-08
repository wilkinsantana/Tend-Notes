// Mermaid's lodash and cytoscape dependencies find the global object with Function('return this')(). The host's install
// scan refuses any Function constructor, so the build ships the equivalent globalThis. Only that exact idiom is rewritten:
// `new Function(...)` and longer identifiers (`MyFunction(...)`) are left alone so the packaging guard still rejects them.
const idiom = /(?<![\w$])(?<!new\s+)Function\(\s*(['"])return this\1\s*\)\s*\(\)/;
export const hasGlobalLookup = (code: string) => idiom.test(code);
export const rewriteGlobalLookup = (code: string) => code.replace(new RegExp(idiom.source, 'g'), 'globalThis');
