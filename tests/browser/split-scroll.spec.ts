import {test, expect, type Locator} from '@playwright/test';
const fraction = (pane: Locator) => pane.evaluate(node => node.scrollTop / Math.max(1,node.scrollHeight-node.clientHeight));
const scrollTo = (pane: Locator, value: number) => pane.evaluate((node, ratio) => {node.scrollTop=(node.scrollHeight-node.clientHeight)*ratio;},value);

test('split scroll lock defaults off, links either pane, and unlocks cleanly',async({page})=>{
  await page.setViewportSize({width:1280,height:800});await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  const source=page.getByRole('textbox',{name:'Note Markdown'});
  await source.fill(Array.from({length:100},(_,i)=>`## Section ${i+1}\n\nA paragraph with **bold text** and a [link](https://example.com).\n`).join('\n'));
  await page.getByRole('button',{name:'Split view',exact:true}).click();
  const preview=page.getByRole('region',{name:'Note preview'}),lock=page.getByRole('button',{name:'Synchronize pane scrolling'});
  await expect(lock).toHaveAttribute('aria-pressed','false');
  await scrollTo(source,.35);await page.waitForTimeout(100);expect(await fraction(preview)).toBe(0);
  await lock.click();await expect(lock).toHaveAttribute('aria-pressed','true');
  await expect.poll(async()=>Math.abs(await fraction(source)-await fraction(preview))).toBeLessThan(.005);
  await scrollTo(preview,.75);await expect.poll(async()=>Math.abs(await fraction(source)-.75)).toBeLessThan(.005);
  await scrollTo(source,1);await expect.poll(()=>fraction(preview)).toBeGreaterThan(.995);
  const lb=await lock.boundingBox(),pb=await preview.boundingBox();expect(Math.abs(lb!.x+lb!.width/2-pb!.x)).toBeLessThan(2);
  await page.screenshot({path:'test-results/split-scroll-locked.png'});
  await lock.click();await scrollTo(preview,.2);await page.waitForTimeout(100);expect(await fraction(source)).toBeGreaterThan(.995);
  await page.getByRole('button',{name:'Split view',exact:true}).click();await expect(lock).toHaveCount(0);
  await page.getByRole('button',{name:'Split view',exact:true}).click();await expect(lock).toHaveAttribute('aria-pressed','false');
});

test('split lock remains centered and usable in stacked mobile panes',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await page.getByRole('button',{name:'Split view',exact:true}).click();
  const lock=page.getByRole('button',{name:'Synchronize pane scrolling'});
  await expect(lock).toBeVisible();await lock.focus();await page.keyboard.press('Space');
  await expect(lock).toHaveAttribute('aria-pressed','true');
  const lb=await lock.boundingBox(),pb=await page.getByRole('region',{name:'Note preview'}).boundingBox();
  expect(Math.abs(lb!.y+lb!.height/2-pb!.y)).toBeLessThan(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
