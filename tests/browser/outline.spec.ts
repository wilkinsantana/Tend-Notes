import { test, expect } from '@playwright/test';

const longDraft = () => ['# Opening', ...Array.from({ length: 70 }, (_, index) => `Paragraph ${index} with enough writing to scroll.`), '## Later section', 'Unsaved final thought'].join('\n');

test('outline jumps an unsaved long draft to the exact source heading without editing it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Small things worth keeping.*Markdown/ }).click();
  const editor = page.getByRole('textbox', { name: 'Note Markdown' });
  const draft = longDraft();
  await editor.fill(draft);
  const trigger = page.getByRole('button', { name: 'Note outline', exact: true });
  await trigger.click();
  const outline = page.getByRole('dialog', { name: 'Note outline', exact: true });
  await expect(outline.getByRole('button', { name: 'Opening', exact: true })).toBeVisible();
  await outline.getByRole('button', { name: 'Later section', exact: true }).click();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(draft);
  expect(await editor.evaluate((node, offset) => ({ start: (node as HTMLTextAreaElement).selectionStart, scrollTop: (node as HTMLTextAreaElement).scrollTop }), draft.indexOf('## Later section'))).toEqual({ start: draft.indexOf('## Later section'), scrollTop: expect.any(Number) });
  expect(await editor.evaluate(node => (node as HTMLTextAreaElement).scrollTop)).toBeGreaterThan(0);
});

test('outline is keyboard-dismissible, restores its trigger, and dismisses outside clicks', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: /Small things worth keeping.*Markdown/ }).click();
  const trigger = page.getByRole('button', { name: 'Note outline', exact: true });
  await trigger.click(); await expect(page.getByRole('dialog', { name: 'Note outline', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Note outline', exact: true })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click(); await page.locator('footer').click();
  await expect(page.getByRole('dialog', { name: 'Note outline', exact: true })).toHaveCount(0);
});

test('outline deliberately opens source from Preview and Split without changing the draft', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: /Small things worth keeping.*Markdown/ }).click();
  const editor = page.getByRole('textbox', { name: 'Note Markdown' });
  const draft = '# Top\n\n## Middle\n\nWriting stays intact.';
  await editor.fill(draft);
  for (const button of ['Preview', 'Split view']) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.getByRole('button', { name: 'Note outline', exact: true }).click();
    await page.getByRole('dialog', { name: 'Note outline', exact: true }).getByRole('button', { name: 'Middle', exact: true }).click();
    await expect(editor).toBeFocused(); await expect(editor).toHaveValue(draft);
  }
});

test('outline stays inside a narrow panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 }); await page.goto('/');
  await page.getByRole('button', { name: /Small things worth keeping.*Markdown/ }).click();
  await page.getByRole('button', { name: 'Note outline', exact: true }).click();
  const outline = page.getByRole('dialog', { name: 'Note outline', exact: true });
  await expect(outline).toBeVisible();
  expect(await outline.evaluate(node => { const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= window.innerWidth; })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});


test('outline reveals headings after soft-wrapped paragraphs', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.getByRole('button', { name: /Small things worth keeping.*Markdown/ }).click();
  const editor = page.getByRole('textbox', { name: 'Note Markdown' });
  const draft = '# Start\n\n' + 'A paragraph that wraps naturally across many visual lines. '.repeat(250) + '\n\n## Destination\nFinal thought';
  await editor.fill(draft);
  await page.getByRole('button', { name: 'Note outline', exact: true }).click();
  await page.getByRole('dialog', { name: 'Note outline', exact: true }).getByRole('button', { name: 'Destination', exact: true }).click();
  await expect(editor).toHaveValue(draft);
  const position = await editor.evaluate(node => {
    const text = node as HTMLTextAreaElement;
    return { offset: text.selectionStart, top: text.scrollTop, maximum: text.scrollHeight - text.clientHeight };
  });
  expect(position.offset).toBe(draft.indexOf('## Destination'));
  expect(position.top).toBeGreaterThan(position.maximum * 0.9);
});
