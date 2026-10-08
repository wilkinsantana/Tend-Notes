import { test, expect, type Page } from '@playwright/test';

// A full Notes app on a scripted Tend document host. `window.nb` lets a test change what the host answers.
const KEY = 'tend-notes:notebook:fixture-user';
type Options = { saved?: string; omit?: string[]; down?: boolean; brokenLists?: string[]; failSave?: boolean };

async function mountApp(page: Page, options: Options = {}) {
  await page.evaluate(async ({ saved, ...state }) => {
    if (saved !== undefined) localStorage.setItem('tend-notes:notebook:fixture-user', saved);
    const modulePath = '/src/index.ts';
    const { activate } = await import(modulePath);
    const hash = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
    const docs = new Map<string, any>();
    for (const [id, libraryId, name, content] of [['a1', 'alpha', 'Alpha note.md', 'In alpha'], ['b1', 'beta', 'Beta note.md', 'In beta']] as const)
      docs.set(id, { id, libraryId, name, content, revision: await hash(content), size: content.length, modifiedAt: 1 });
    const nb = (window as any).nb = { omit: [] as string[], down: false, brokenLists: [] as string[], failSave: false, libraryTimes: [] as number[], saves: 0, ...state };
    const guard = () => { if (nb.down) throw new Error('Bad Gateway'); };
    const host = { id: 'host.tend.notes', user: { id: 'fixture-user', name: 'Writer', role: 'user' }, onUnmount() {}, documents: {
      version: 1,
      async libraries() { nb.libraryTimes.push(Date.now()); guard(); return [{ id: 'alpha', name: 'Alpha', canCreate: true }, { id: 'beta', name: 'Beta', canCreate: true }].filter(l => !nb.omit.includes(l.id)); },
      async index() { return { indexed: 0, skipped: 0, more: false }; },
      async list(libraryId: string) {
        guard(); if (nb.brokenLists.includes(libraryId)) throw new Error('Bad Gateway');
        const items = [...docs.values()].filter(d => d.libraryId === libraryId).map(({ content, ...note }) => note);
        return { items, total: items.length, nextOffset: null };
      },
      async read(id: string) { guard(); return { ...docs.get(id) }; },
      async save(id: string, input: { content: string }) { nb.saves++; guard(); if (nb.failSave) throw new Error('offline'); const doc = docs.get(id); Object.assign(doc, { content: input.content, revision: await hash(input.content) }); return { ...doc }; },
      async create() { throw new Error('not used'); }, async delete() { throw new Error('not used'); },
    } };
    const root = document.createElement('div'); root.style.height = '720px'; document.body.replaceChildren(root);
    activate(host).mount(root);
  }, options);
}
const stored = (page: Page) => page.evaluate(key => localStorage.getItem(key), KEY);

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.evaluate(() => localStorage.removeItem('tend-notes:notebook:fixture-user')); });

test('a saved notebook missing from one response opens a fallback without overwriting the saved choice', async ({ page }) => {
  await mountApp(page, { saved: 'beta', omit: ['beta'] });
  await expect(page.locator('#notes-library')).toHaveValue('alpha');
  await expect(page.getByRole('button', { name: /^Alpha note / })).toBeVisible();
  expect(await stored(page)).toBe('beta');
  // The next load sees the notebook again and reopens it.
  await page.reload();
  await mountApp(page);
  await expect(page.locator('#notes-library')).toHaveValue('beta');
  await expect(page.getByRole('button', { name: /^Beta note / })).toBeVisible();
  // Choosing a notebook is what is remembered.
  await page.locator('#notes-library').selectOption('alpha');
  await expect(page.getByRole('button', { name: /^Alpha note / })).toBeVisible();
  expect(await stored(page)).toBe('alpha');
});

test('with no saved choice, a notebook whose count fails is skipped and Notes still opens', async ({ page }) => {
  await mountApp(page, { brokenLists: ['alpha'] });
  await expect(page.locator('#notes-library')).toHaveValue('beta');
  await expect(page.getByRole('button', { name: /^Beta note / })).toBeVisible();
  await expect(page.getByText('Reconnecting to your notes…')).toHaveCount(0);
  expect(await stored(page)).toBeNull(); // an automatic pick is not the person's choice
});

test('reconnect attempts back off 3 s, 6 s, 12 s, then 30 s, and a recovery resets them', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.goto('/');
  await mountApp(page, { down: true });
  await expect(page.getByText('Reconnecting to your notes…').first()).toBeVisible();
  await page.clock.runFor(61000);
  const times = await page.evaluate(() => (window as any).nb.libraryTimes as number[]);
  const gaps = times.slice(1).map((time, i) => time - times[i]);
  expect(times.length).toBeGreaterThanOrEqual(4);
  expect(times.length).toBeLessThanOrEqual(6);
  [3000, 6000, 12000, 30000].forEach((least, i) => { if (gaps[i] !== undefined) expect(gaps[i]).toBeGreaterThanOrEqual(least); });
  expect(Math.max(...gaps)).toBeLessThanOrEqual(33000);
  await page.evaluate(() => { (window as any).nb.down = false; });
  await page.clock.runFor(33000);
  await expect(page.getByRole('button', { name: /^Alpha note / })).toBeVisible();
});

test('a dirty draft survives an outage and reconnect, and is offered again after a restart', async ({ page }) => {
  await mountApp(page, { failSave: true });
  await page.getByRole('button', { name: /^Alpha note / }).click();
  await page.getByRole('button', { name: 'Edit Markdown', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Note Markdown' });
  await editor.fill('My unsaved thoughts');
  await expect.poll(() => page.evaluate(() => (window as any).nb.saves), { timeout: 15000 }).toBeGreaterThan(0);
  await page.evaluate(() => { (window as any).nb.down = true; });
  await page.waitForTimeout(7000);
  await expect(editor).toHaveValue('My unsaved thoughts');
  await page.evaluate(() => { (window as any).nb.down = false; });
  await expect(page.getByText('Reconnecting to your notes…')).toHaveCount(0, { timeout: 20000 });
  await expect(editor).toHaveValue('My unsaved thoughts');
  // The restart: the page reloads, start() runs again, and the draft is offered for recovery.
  await page.reload();
  await mountApp(page);
  const recovery = page.locator('.recovery');
  await expect(recovery).toContainText('Pick up an unsaved draft', { timeout: 15000 });
  await recovery.getByRole('button', { name: /Alpha note|^Alpha$/ }).first().click();
  await expect(page.getByRole('textbox', { name: 'Note Markdown' })).toHaveValue('My unsaved thoughts');
});
