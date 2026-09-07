import { test, expect, type Page } from '@playwright/test';

const metadata = (body: string, color = 'none', pinned = false) =>
  `<!-- tend-notes {"v":1,"tags":[],"color":"${color}","pinned":${pinned}} -->\n${body}`;

async function seed(page: Page) {
  await page.addInitScript(entries => localStorage.setItem('tend-notes:demo-documents', JSON.stringify(entries)), [
    { id: 'amber', libraryId: 'personal', name: 'Amber.md', content: metadata('# Amber note', 'amber'), modifiedAt: 1, revision: 'amber', size: 1 },
    { id: 'pinned', libraryId: 'personal', name: 'Pinned.md', content: metadata('# Pinned note', 'sage', true), modifiedAt: 2, revision: 'pinned', size: 1 },
    { id: 'zulu', libraryId: 'personal', name: 'Zulu.md', content: metadata('# Zulu note'), modifiedAt: 3, revision: 'zulu', size: 1 },
  ]);
}

const sidebar = (page: Page) => page.getByRole('complementary');

test('sidebar keeps capture and filter action rows distinct, with keyboard search and menus', async ({ page }) => {
  await seed(page); await page.goto('/');
  const aside = sidebar(page);
  await expect(aside.getByRole('button', { name: 'New note' })).toBeVisible();
  await expect(aside.getByRole('group', { name: 'Note filters and views' })).toBeVisible();
  const rows = await page.locator('.capture-actions, .filter-tools').evaluateAll(nodes => nodes.map(node => ({ top: node.getBoundingClientRect().top, parent: node.parentElement?.tagName })));
  expect(rows).toHaveLength(2);
  expect(rows[0].top).toBeLessThan(rows[1].top);
  expect(rows[0].parent).toBe(rows[1].parent);

  const search = aside.getByRole('button', { name: 'Search notes' });
  await expect(aside.getByRole('textbox', { name: 'Search your notes' })).toHaveCount(0);
  await search.click();
  const input = aside.getByRole('textbox', { name: 'Search your notes' });
  await expect(input).toBeFocused();
  await input.fill('amber');
  await expect(aside.getByRole('button', { name: /Amber.*Markdown/ })).toBeVisible();
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(aside.getByRole('button', { name: /Amber.*Markdown/ })).toBeVisible();

  const color = aside.getByRole('button', { name: 'Filter note color' });
  await color.click();
  const colorMenu = aside.getByRole('group', { name: 'Note color filter' });
  await expect(colorMenu.getByRole('button', { name: 'Amber' })).toBeVisible();
  await colorMenu.getByRole('button', { name: 'Amber' }).click();
  await expect(aside.locator('.note')).toHaveCount(1);
  await expect(color).toHaveAttribute('aria-expanded', 'false');
  await expect(color).toHaveAccessibleDescription('Amber');

  const sort = aside.getByRole('button', { name: 'Sort notes' });
  await sort.click();
  await expect(aside.getByRole('group', { name: 'Note sort order' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(aside.getByRole('group', { name: 'Note sort order' })).toHaveCount(0);
  await sort.click(); await aside.getByRole('button', { name: 'Title A–Z' }).click();
  await expect(sort).toHaveAttribute('aria-expanded', 'false');
  await expect(sort).toHaveAccessibleDescription('Title A–Z');
  await sort.click();
  await expect(aside.getByRole('button', { name: 'Title A–Z' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(aside.getByRole('button', { name: 'Recently edited' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  for (let index = 0; index < 8; index++) {
    if (await aside.getByRole('button', { name: 'Add notebook' }).evaluate(node => node === document.activeElement)) break;
    await page.keyboard.press('Shift+Tab');
  }
  await expect(aside.getByRole('button', { name: 'Add notebook' })).toBeFocused();
  await expect(aside.getByRole('group', { name: 'Note sort order' })).toHaveCount(0);
  await sort.click(); await sort.click();
  await expect(sort).toHaveAttribute('aria-expanded', 'false');
  await expect(aside.getByRole('group', { name: 'Note sort order' })).toHaveCount(0);
  await color.click(); await page.locator('main').click({ position: { x: 5, y: 5 } });
  await expect(aside.getByRole('group', { name: 'Note color filter' })).toHaveCount(0);
});

test('pin filter toggles back, and list pins can be undone by the inverse action', async ({ page }) => {
  await seed(page); await page.goto('/');
  const aside = sidebar(page);
  const filter = aside.getByRole('button', { name: 'Pinned notes (1)' });
  await filter.click();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(aside.locator('.note')).toHaveCount(1);
  await filter.click();
  await expect(filter).toHaveAttribute('aria-pressed', 'false');
  await expect(aside.locator('.note')).toHaveCount(3);

  const pin = aside.getByRole('button', { name: 'Pin Amber' });
  await pin.click();
  await expect(aside.getByRole('button', { name: 'Unpin Amber' })).toBeVisible();
  await aside.getByRole('button', { name: 'Unpin Amber' }).click();
  await expect(aside.getByRole('button', { name: 'Pin Amber' })).toBeVisible();
});

test('Trash is immediately left of Refresh, and ToDo returns focus to its entry', async ({ page }) => {
  await seed(page); await page.goto('/?trash');
  const aside = sidebar(page);
  const trash = aside.getByRole('button', { name: 'Trash' });
  const refresh = aside.getByRole('button', { name: 'Refresh notes' });
  const placement = await Promise.all([trash.boundingBox(), refresh.boundingBox()]);
  expect(placement[0]).not.toBeNull(); expect(placement[1]).not.toBeNull();
  expect(placement[0]!.x + placement[0]!.width).toBeLessThanOrEqual(placement[1]!.x + 1);
  expect(await trash.locator('xpath=..').evaluate(node => node.parentElement?.className)).toContain('list-heading');
  await trash.click(); await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Notes' }).click();
  await expect(trash).toBeFocused();

  const todo = aside.getByRole('button', { name: 'ToDo' });
  await todo.click(); await expect(page.getByRole('heading', { name: 'ToDo', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Back to Notes' }).click();
  await expect(todo).toBeFocused();
});

test('narrow sidebar does not overflow and themed transparent popovers stay readable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 }); await seed(page); await page.goto('/');
  const aside = sidebar(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('#app').evaluate(node => {
    const element = node as HTMLElement;
    element.style.setProperty('--tend-panel-surface-alpha', '0%');
    element.style.setProperty('--color-base-100', '#fbfdfc');
    element.style.setProperty('--color-base-content', '#13231e');
    element.style.setProperty('--color-base-200', '#e9f1ed');
  });
  await aside.getByRole('button', { name: 'Filter note color' }).click();
  const popover = aside.locator('.filter-popover');
  await expect(popover).toBeVisible();
  const colors = await popover.evaluate(node => {
    const style = getComputedStyle(node);
    return { color: style.color, background: style.backgroundColor, opacity: style.opacity, width: node.getBoundingClientRect().width, asideWidth: node.parentElement!.getBoundingClientRect().width };
  });
  expect(colors.opacity).toBe('1');
  expect(colors.color).not.toBe(colors.background);
  expect(colors.width).toBeLessThanOrEqual(colors.asideWidth);
  await expect(popover.getByRole('button', { name: 'Sage' })).toBeVisible();
});
