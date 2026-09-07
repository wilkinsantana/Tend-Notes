import { test, expect } from '@playwright/test';
import type { WritingSurface } from '../../src/writingSurface';
declare global { interface Window { writingProbe: {surface: WritingSurface; changes: number; reset: (body: string) => void} } }
const route='/tests/fixtures/writing-surface.html';

test('formatted surface preserves Markdown and uses one existing Undo owner', async ({page}, testInfo) => {
  await page.goto(route);
  const editor=page.getByRole('textbox',{name:'Formatted Markdown'});
  await expect(editor).toBeVisible();
  const original=await page.evaluate(()=>window.writingProbe.surface.body);
  await page.evaluate(()=>{const s=window.writingProbe.surface;s.select(s.body.length);s.focus()});
  await page.keyboard.type(' and more');
  await expect.poll(()=>page.evaluate(()=>window.writingProbe.surface.body)).toBe(original+' and more');
  await page.keyboard.press('Control+z');
  await expect.poll(()=>page.evaluate(()=>window.writingProbe.surface.body)).toBe(original);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(()=>page.evaluate(()=>window.writingProbe.surface.body)).toBe(original+' and more');
  expect(await editor.locator('.cm-line').first().locator('span').evaluateAll(nodes=>Math.max(...nodes.map(node=>parseFloat(getComputedStyle(node).fontSize))))).toBeGreaterThan(20);
  await page.screenshot({path:testInfo.outputPath('formatted-writing.png')});
});

test('numbered lists continue and an empty item exits without a second history stack', async ({page})=>{
  await page.goto(route);
  await page.evaluate(()=>{window.writingProbe.reset('1. First');const s=window.writingProbe.surface;s.select(s.body.length);s.focus()});
  await page.keyboard.press('Enter');
  await expect.poll(()=>page.evaluate(()=>window.writingProbe.surface.body)).toBe('1. First\n2. ');
  await page.keyboard.press('Enter');
  await expect.poll(()=>page.evaluate(()=>window.writingProbe.surface.body)).toBe('1. First\n\n');
  await page.keyboard.press('Control+z');
  await expect.poll(()=>page.evaluate(()=>window.writingProbe.surface.body)).toBe('1. First\n2. ');
});

test('external refresh and selection never become edits; readonly refuses typing', async ({page})=>{
  await page.goto(route);
  await page.evaluate(()=>{const s=window.writingProbe.surface;s.setBody('😀 Refreshed **writing**');s.select(3,12);s.setReadOnly(true);s.focus()});
  await page.keyboard.type('unexpected');
  await expect.poll(()=>page.evaluate(()=>window.writingProbe.surface.body)).toBe('😀 Refreshed **writing**');
  expect(await page.evaluate(()=>window.writingProbe.changes)).toBe(0);
  await page.evaluate(()=>window.writingProbe.surface.setBody('Remote update while readonly'));
  await expect.poll(()=>page.evaluate(()=>window.writingProbe.surface.body)).toBe('Remote update while readonly');
  expect(await page.evaluate(()=>window.writingProbe.changes)).toBe(0);
});

test('large Markdown keeps a bounded visible DOM and reaches its final line', async ({page})=>{
  await page.goto(route);
  const count=20000;
  await page.evaluate(count=>{window.writingProbe.reset('A fairly long note line with ordinary words.\n'.repeat(count)+'Final thought');const s=window.writingProbe.surface;s.select(s.body.length);s.focus()},count);
  await expect(page.getByText('Final thought',{exact:true})).toBeVisible();
  expect(await page.locator('.cm-line').count()).toBeLessThan(300);
  await page.keyboard.type('!');
  await expect.poll(()=>page.evaluate(()=>window.writingProbe.surface.body.endsWith('Final thought!'))).toBe(true);
});

test('literal HTML and external media make no requests or executable elements', async ({page,baseURL})=>{
  const external:string[]=[];
  page.on('request',request=>{if(new URL(request.url()).origin !== new URL(baseURL!).origin)external.push(request.url())});
  await page.goto(route);
  await page.evaluate(()=>window.writingProbe.reset('<img src="https://example.invalid/private" onerror="alert(1)">\n![image](https://example.invalid/image)\n<script>alert(1)<\/script>'));
  await expect(page.locator('.cm-content img, .cm-content iframe, .cm-content script')).toHaveCount(0);
  expect(external).toEqual([]);
});
