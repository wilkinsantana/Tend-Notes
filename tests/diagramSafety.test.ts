import { describe, expect, test } from 'bun:test';
import { DIAGRAM_CHAR_BUDGET, decodeCssEscapes, isFragmentReference, safeDiagramSource, scrubCss, withinDiagramBudget } from '../src/diagramSafety';

const fetches = (css: string) => /url\(\s*["']?(?!#)|image-set|@import|cross-fade|src\(/i.test(scrubCss(css));

describe('scrubCss', () => {
  test('removes remote url() from style text, quoted or not', () => {
    for (const css of [
      'text{mask-image:url(https://evil/b)}',
      'text{mask-image:url("https://evil/b")}',
      "text{mask-image:url('https://evil/b')}",
      'text{background:url(  //evil/b  )}',
      'text{background:URL(http://evil/b)}',
      'text{background:url(data:image/svg+xml;base64,AAAA)}',
      '@font-face{font-family:x;src:url(https://evil/f.woff2)}',
      'text{background:url(https://evil/unterminated',
    ]) expect({ css, fetches: fetches(css) }).toEqual({ css, fetches: false });
  });

  test('removes escaped spellings of url(', () => {
    for (const css of [
      'text{mask-image:\\75\\72\\6c(https://evil/b)}',
      'text{mask-image:\\75 rl(https://evil/b)}',
      'text{mask-image:u\\72l(https://evil/b)}',
      'text{mask-image:url(\\68ttps://evil/b)}',
      'text{mask-image:url("\\68ttps://evil/b")}',
    ]) expect({ css, fetches: fetches(css) }).toEqual({ css, fetches: false });
    expect(decodeCssEscapes('\\75\\72\\6c( \\"')).toBe('url( "');
  });

  test('removes image-set(), cross-fade(), src() and @import', () => {
    for (const css of [
      'text{background:image-set("https://evil/a.png" 1x)}',
      'text{background:-webkit-image-set(url(https://evil/a.png) 1x)}',
      'text{background:cross-fade(url(https://evil/a.png),url(#a),50%)}',
      'text{background:src("https://evil/a.png")}',
      '@import "https://evil/a.css";text{fill:red}',
      '@IMPORT url(https://evil/a.css);text{fill:red}',
    ]) expect({ css, fetches: fetches(css) }).toEqual({ css, fetches: false });
    expect(scrubCss('@import "https://evil/a.css";text{fill:red}')).toBe('text{fill:red}');
  });

  test('keeps same-document fragment references and untouched CSS byte for byte', () => {
    for (const css of ['marker-end:url(#arrow_pointEnd)', 'fill:url("#grad")', "fill:url('#g')", 'fill: url( #g )', '.a{fill:red;stroke:#333}', 'stroke:rgb(1, 2, 3)', 'content:"a\\"b"'])
      expect(scrubCss(css)).toBe(css);
  });

  test('a fragment survives next to a remote reference', () => {
    expect(scrubCss('a{fill:url(#g);mask:url(https://evil/x)}')).toBe('a{fill:url(#g);mask:none}');
  });
});

describe('isFragmentReference', () => {
  test('accepts only fragments of this document', () => {
    expect(isFragmentReference('#arrow')).toBe(true);
    expect(isFragmentReference('  #arrow')).toBe(true);
    for (const value of ['https://evil', '//evil', 'javascript:alert(1)', 'data:text/html,x', 'other.svg#a', '', 'a#b']) expect(isFragmentReference(value)).toBe(false);
  });
});

describe('withinDiagramBudget', () => {
  test('counts all diagrams in a note together', () => {
    const big = 'x'.repeat(DIAGRAM_CHAR_BUDGET / 3);
    expect(withinDiagramBudget([big, big, big, 'y'])).toEqual([true, true, true, false]);
    expect(withinDiagramBudget(['a', 'b'])).toEqual([true, true]);
    expect(withinDiagramBudget(['abcd', 'e'], 4)).toEqual([true, false]);
  });
});

describe('safeDiagramSource', () => {
  const evil = /evil\.example/;
  test('drops themeCSS and any setting that is not a plain word, in either quote style', () => {
    for (const source of [
      '%%{init: {"themeCSS": "text{mask-image:url(https://evil.example/b)}"}}%%\ngraph TD\n  A --> B',
      "%%{init: {'themeCSS': 'text{mask-image:url(https://evil.example/b)}'}}%%\ngraph TD\n  A --> B",
      '%%{init: {"fontFamily": "x;background:url(https://evil.example/f)"}}%%\ngraph TD\n  A --> B',
      '%%{init: {"themeVariables": {"lineColor": "red;background:url(https://evil.example/h)"}}}%%\ngraph TD\n  A --> B',
      '%%{init: {"sequence": {"messageFontFamily": "a\\u0075rl(https://evil.example/x)"}}}%%\nsequenceDiagram\n  A->>B: hi',
      '%%{ initialize : {"themeCSS": "@import \'https://evil.example/d.css\'"} }%%\ngraph TD\n  A --> B',
    ]) expect(safeDiagramSource(source)).not.toMatch(evil);
  });
  test('keeps plain settings so ordinary directives still work', () => {
    const out = safeDiagramSource('%%{init: {"flowchart": {"curve": "linear", "nodeSpacing": 40, "htmlLabels": false}, "theme": "forest", "themeVariables": {"primaryColor": "#ffcc00", "fontFamily": "Arial, sans-serif"}}}%%\ngraph TD\n  A --> B');
    expect(out).toContain('"curve":"linear"');
    expect(out).toContain('"nodeSpacing":40');
    expect(out).toContain('"primaryColor":"#ffcc00"');
    expect(out.endsWith('graph TD\n  A --> B')).toBe(true);
  });
  test('an unparsable or unknown directive is removed, wrap is kept', () => {
    expect(safeDiagramSource('%%{init: {"a": }}%%\ngraph TD')).toBe('\ngraph TD');
    expect(safeDiagramSource('%%{foo: {"themeCSS":"x"}}%%\ngraph TD')).toBe('\ngraph TD');
    expect(safeDiagramSource('%%{wrap}%%\ngraph TD')).toBe('%%{wrap}%%\ngraph TD');
  });
  test('front matter keeps only a plain title and the line count', () => {
    const source = '---\ntitle: My plan\nconfig:\n  themeCSS: "text{mask-image:url(https://evil.example/fm)}"\n---\ngraph TD\n  A --> B';
    const out = safeDiagramSource(source);
    expect(out).not.toMatch(evil);
    expect(out).toContain('title: My plan');
    expect(out.split('\n').length).toBe(source.split('\n').length);
    expect(safeDiagramSource('---\nconfig:\n  theme: dark\n---\ngraph TD')).toBe('\n\n\n\ngraph TD');
  });
  test('a second front matter fence further down cannot reintroduce configuration', () => {
    const out = safeDiagramSource('---\ntitle: a\n---\ngraph TD\n  A --> B\n---\nconfig:\n  themeCSS: "url(https://evil.example/z)"\n---');
    expect(out.split('\n').filter(line => line.trim() === '---').length).toBe(2);
  });
  test('node images are removed from @{ } settings; other settings and plain text stay', () => {
    const out = safeDiagramSource('graph TD\n  A@{ img: "https://evil.example/n.png", label: "x", pos: "b", w: 60 }\n  B@{ "img" : \'https://evil.example/o.png\' , shape: "rect" }\n  C["an img: note"] --> D');
    expect(out).not.toMatch(evil);
    expect(out).toContain('label: "x"');
    expect(out).toContain('shape: "rect"');
    expect(out).toContain('C["an img: note"]');
  });
  test('a diagram with no configuration is returned unchanged', () => {
    const plain = 'graph TD\n  A[Start] --> B{Choice}\n  B -->|Yes| C[Do it]\n  A --- C';
    expect(safeDiagramSource(plain)).toBe(plain);
  });
});
