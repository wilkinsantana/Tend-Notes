import { expect, test, type Page } from '@playwright/test';

function note(id: string, start: number, count: number) {
  return {
    id,
    libraryId: id === 'work' ? 'work' : 'personal',
    name: `${id}.md`,
    content: Array.from({ length: count }, (_, index) => `- [ ] Task ${start + index}`).join('\n') + '\n',
  };
}

async function seedTasks(page: Page, total = 250) {
  const entries = [note('home', 1, 84), note('projects', 85, 83), note('work', 168, total - 167)];
  await page.goto('/');
  await page.evaluate(async (seed) => {
    const documents = await Promise.all(seed.map(async (entry) => {
      const bytes = new TextEncoder().encode(entry.content);
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return {
        ...entry,
        revision: [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join(''),
        size: entry.content.length,
        modifiedAt: 1,
      };
    }));
    localStorage.setItem('tend-notes:demo-documents', JSON.stringify(documents));
  }, entries);
  await page.reload();
}

test('ToDo paginates large task collections without hiding global search results', async ({ page }) => {
  await seedTasks(page);
  await page.getByRole('button', { name: /^ToDo/ }).click();
  await expect(page.getByText('Showing 1–100 of 250')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(100);

  await page.getByRole('searchbox', { name: 'Search tasks, notes, and notebooks' }).fill('Task 250');
  await expect(page.getByText('Showing 1–1 of 1')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Mark complete: Task 250' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(1);

  await page.getByRole('searchbox', { name: 'Search tasks, notes, and notebooks' }).fill('');
  await expect(page.getByText('Showing 1–100 of 250')).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).press('Enter');
  await expect(page.getByText('Showing 101–200 of 250')).toBeVisible();
  await page.getByRole('button', { name: 'Previous page' }).press('Enter');
  await expect(page.getByText('Showing 1–100 of 250')).toBeVisible();

  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Showing 201–250 of 250')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(50);
  await page.getByRole('checkbox', { name: 'Mark complete: Task 250' }).click();
  await expect(page.getByText('Showing 201–249 of 249')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(49);
});


test('completion clamps the last page and keeps narrow pagination reachable',async({page},testInfo)=>{
  await page.setViewportSize({width:360,height:780});await seedTasks(page,201);
  await page.getByRole('button',{name:/^ToDo/}).click();
  await expect(page.getByText('Showing 1–100 of 201')).toBeVisible();
  const next=page.getByRole('button',{name:'Next page'});
  await expect(next).toBeInViewport();
  expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await next.click();await next.click();
  await expect(page.getByText('Showing 201–201 of 201')).toBeVisible();
  await page.getByRole('checkbox',{name:'Mark complete: Task 201',exact:true}).click();
  await expect(page.getByText('Showing 101–200 of 200')).toBeVisible();
  await expect(next).toBeDisabled();await expect(page.getByRole('checkbox')).toHaveCount(100);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({path:testInfo.outputPath('task-pagination-narrow.png')});
});
