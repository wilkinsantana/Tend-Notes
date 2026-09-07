import {test,expect} from '@playwright/test';
test('formulas preview, insert, render and undo as portable Markdown',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  const source=page.getByRole('textbox',{name:'Note Markdown'});
  await source.fill('An equation: '); await source.press('Control+End');
  await page.getByRole('button',{name:'Insert formula',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Insert formula'});
  await dialog.getByLabel('LaTeX equation').fill('a\n+b');
  await dialog.getByLabel('Display on its own line').uncheck();
  await expect(dialog.getByRole('button',{name:'Insert formula',exact:true})).toBeDisabled();
  await expect(dialog).toContainText('Use display mode for a multiline formula.');
  await dialog.getByLabel('LaTeX equation').fill('\\frac{1}{2}');
  await expect(dialog.locator('math')).toHaveCount(1);
  await dialog.getByLabel('Display on its own line').uncheck();
  await dialog.getByRole('button',{name:'Insert formula',exact:true}).click();
  await expect(source).toHaveValue('An equation: $\\frac{1}{2}$');
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.rendered-markdown math')).toHaveCount(1);
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(source).toHaveValue('An equation: ');
});
test('code and source HTML stay literal; malformed formulas stay editable',async({page})=>{
  await page.goto('/'); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await page.getByRole('textbox',{name:'Note Markdown'}).fill('`$x$`\n\n```\n$$\nx\n$$\n```\n\n$$\n\\sqrt{x}\n$$\n\n<span data-notes-math="0">fake</span>');
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.rendered-markdown math')).toHaveCount(1);
  await expect(page.locator('.rendered-markdown')).toContainText('<span data-notes-math="0">fake</span>');
  await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
  await page.getByRole('button',{name:'Insert formula',exact:true}).click();
  await page.getByLabel('LaTeX equation').fill('\\frac{');
  await expect(page.getByRole('dialog').getByRole('button',{name:'Insert formula',exact:true})).toBeDisabled();
  await page.getByLabel('LaTeX equation').press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('rich writing hides inactive syntax without modifying Markdown',async({page})=>{
  await page.goto('/'); await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  const source=page.getByRole('textbox',{name:'Note Markdown'});
  const text='# Heading\n\n**Bold** and *italic*.\n\nWrite here';
  await source.fill(text); await source.press('Control+End');
  await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
  const rich=page.getByRole('textbox',{name:'Formatted Markdown'});
  await expect(rich).toContainText('Bold and italic.');
  await expect(rich).not.toContainText('**Bold**');
  await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
  await expect(source).toHaveValue(text);
});

 test('rich checklist clicks share source and undo history',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  const source=page.getByRole('textbox',{name:'Note Markdown'});
  await source.fill('- [ ] Buy milk\n\nWriting');await source.press('Control+End');
  await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
  const checkbox=page.getByRole('checkbox',{name:'Buy milk',exact:true});
  await page.getByRole('button',{name:'Insert formula',exact:true}).click();
  await expect(page.locator('.formatted-editor input[type=checkbox]')).toBeDisabled();
  await page.getByLabel('LaTeX equation').press('Escape');
  await expect(checkbox).toBeEnabled();await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
  await expect(source).toHaveValue('- [x] Buy milk\n\nWriting');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(source).toHaveValue('- [ ] Buy milk\n\nWriting');
});

test('writing mode controls sit together and enter writing from Preview',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  const modes=page.getByLabel('Editor view',{exact:true});
  await expect(modes.getByRole('button')).toHaveCount(4);
  await expect(modes.getByRole('button').nth(1)).toHaveAccessibleName('Rich text writing');
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await modes.getByRole('button',{name:'Rich text writing',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Formatted Markdown'})).toBeVisible();
  await modes.getByRole('button',{name:'Rich text writing',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Note Markdown'})).toBeVisible();
});

test('rich selection stays blue through focus and theme changes',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
  await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
  const rich=page.getByRole('textbox',{name:'Formatted Markdown'});
  await rich.press('Control+a');
  const selection=page.locator('.cm-selectionBackground').first();
  await expect(selection).toHaveCSS('background-color','rgba(59, 130, 246, 0.35)');
  await page.getByRole('button',{name:'Preview light theme'}).click();
  await expect(selection).toHaveCSS('background-color','rgba(59, 130, 246, 0.35)');
  await rich.focus();
  await expect(selection).toHaveCSS('background-color','rgba(59, 130, 246, 0.35)');
});
