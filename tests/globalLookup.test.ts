import { describe, expect, test } from 'bun:test';
import { hasGlobalLookup, rewriteGlobalLookup } from '../scripts/globalLookup';

describe('global object lookup rewrite', () => {
  test('rewrites the Function("return this")() idiom, quoted either way', () => {
    expect(rewriteGlobalLookup('var g = Function("return this")();')).toBe('var g = globalThis;');
    expect(rewriteGlobalLookup("var g = (Function( 'return this' )());")).toBe('var g = (globalThis);');
    expect(rewriteGlobalLookup('a=Function("return this")(),b=Function("return this")()')).toBe('a=globalThis,b=globalThis');
  });
  test('never rewrites a constructor call, so the packaging guard still sees it', () => {
    for (const code of ['new Function("return this")()', 'new  Function("return this")()', 'new\nFunction("return this")()']) {
      expect(hasGlobalLookup(code)).toBe(false);
      expect(rewriteGlobalLookup(code)).toBe(code);
    }
  });
  test('ignores longer identifiers and other bodies', () => {
    for (const code of ['MyFunction("return this")()', '$Function("return this")()', 'Function("return 1")()', 'Function("return this")']) expect(rewriteGlobalLookup(code)).toBe(code);
  });
});
