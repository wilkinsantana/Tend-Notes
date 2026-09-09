import {test,expect} from '@playwright/test';
test('rich link dialog keeps selected text and shares undo',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Small things worth keeping.*Markdown/}).click();
 await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
 const source=page.getByRole('textbox',{name:'Note Markdown'});await source.fill('A useful link');
 await page.getByRole('button',{name:'Rich text writing',exact:true}).click();
 const rich=page.getByRole('textbox',{name:'Rich text editor'});await rich.press('Control+a');
 await page.getByRole('button',{name:'Insert link',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Insert link'});await dialog.getByRole('textbox',{name:'Link address'}).fill('https://example.org/guide');
 await dialog.getByRole('button',{name:'Insert link',exact:true}).click();
 await expect(rich.locator('.rich-link')).toHaveText('A useful link');
 await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();await expect(source).toHaveValue('[A useful link](https://example.org/guide)');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(source).toHaveValue('A useful link');
});
