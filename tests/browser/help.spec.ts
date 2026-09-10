import {test,expect} from '@playwright/test';

for(const viewport of [{width:1280,height:800},{width:390,height:844}])test(`Notes guide is accessible and fits ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/');
 const trigger=page.getByRole('button',{name:'Notes guide',exact:true});
 await expect(trigger).toHaveCount(1);await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Notes guide',exact:true});
 await expect(dialog).toBeVisible();await expect(dialog.getByText('Your first note',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Sharing',exact:true}).click();await expect(dialog.getByText('Choose who can do what',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Offline & PWA',exact:true}).click();await expect(dialog.getByText('Prepare before disconnecting',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Troubleshooting',exact:true}).click();await expect(dialog.getByText('A voice or model will not download',{exact:true})).toBeVisible();
 expect(await dialog.evaluate(node=>node.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
 const close=dialog.getByRole('button',{name:'Close Notes guide'});await close.focus();await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'Troubleshooting',exact:true})).toBeFocused();
 await page.keyboard.press('Tab');await expect(close).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
});
