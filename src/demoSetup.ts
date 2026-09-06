/** Preview-only stand-in for Tend's native storage dialog. Never packaged. */
export function demoStorageSetup(purpose: 'notebook' | 'backup'): Promise<{name: string; provider: string} | null> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', purpose === 'notebook' ? 'Set up your notebook' : 'Set up a backup destination');
    dialog.style.cssText = 'width:min(480px,calc(100% - 32px));border:1px solid #80998e40;border-radius:16px;padding:26px;background:var(--color-base-100,#151b19);color:var(--color-base-content,#dce3df);font:13px system-ui;box-shadow:0 20px 80px #0008';
    const heading = document.createElement('h2'); heading.textContent = purpose === 'notebook' ? 'A home for your ideas.' : 'Choose where backups go';
    heading.style.cssText = 'font-size:21px;font-weight:550;margin:0 0 12px';
    const info = document.createElement('p'); info.textContent = purpose === 'notebook' ? 'Preview only. Tend automatically prepares a protected folder on its server. You can choose a separate backup destination after setup. No real server is connected in this demo.' : 'Preview only. In Tend, connect your backup storage using Tend’s existing connection forms. No account or drive is connected in this demo.';
    info.style.cssText = 'opacity:.7;line-height:1.7;margin-bottom:20px';
    const form = document.createElement('form');
    const nameLabel = document.createElement('label'); nameLabel.textContent = purpose === 'notebook' ? 'Notebook name' : 'Destination name';
    const name = document.createElement('input'); name.required = true; name.maxLength = 120; name.value = purpose === 'notebook' ? 'My notes' : 'My backup'; nameLabel.append(name);
    const driveLabel = document.createElement('label'); driveLabel.textContent = 'Storage drive';
    const select = document.createElement('select');
    for (const [value, label] of (purpose === 'notebook' ? [['local','Server folder']] : [['gdrive','Google Drive'],['local','Server folder'],['s3','S3-compatible storage']])) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; option.style.background='var(--color-base-200,#202925)'; option.style.color='var(--color-base-content,#dce3df)'; select.append(option);
    }
    driveLabel.append(select);
    for (const field of [name, select]) field.style.cssText = 'box-sizing:border-box;display:block;width:100%;margin:8px 0 18px;padding:11px;border:1px solid #80998e40;border-radius:8px;background:var(--color-base-200,#202925);color:inherit;font:inherit';
    const actions = document.createElement('div'); actions.style.cssText = 'display:flex;justify-content:flex-end;gap:12px;margin-top:24px';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = purpose === 'notebook' ? 'Start writing' : 'Use sample destination';
    for (const button of [cancel, submit]) button.style.cssText = 'padding:11px 14px;border:1px solid #80998e40;border-radius:8px;background:var(--color-base-200,#202925);color:inherit;cursor:pointer;font:inherit';
    submit.style.background = 'var(--color-primary,#69b899)'; submit.style.color = 'var(--color-primary-content,#10221a)';
    const finish = (result: {name: string; provider: string} | null) => { dialog.close(); dialog.remove(); resolve(result); };
    cancel.onclick = () => finish(null);
    dialog.oncancel = e => { e.preventDefault(); finish(null); };
    form.onsubmit = e => { e.preventDefault(); if (name.value.trim()) finish({name:name.value.trim(),provider:select.value}); };
    actions.append(cancel,submit);
    if (purpose === 'notebook') {
      const location = document.createElement('p'); location.textContent = 'This Tend server · Recommended';
      location.style.cssText = 'padding:16px;border:1px solid #80998e40;border-radius:10px;background:var(--color-base-200,#202925)';
      const change = document.createElement('button'); change.type = 'button'; change.textContent = 'Use a different server';
      change.style.cssText = 'background:none;border:0;padding:8px 0;color:var(--color-primary,#69b899);cursor:pointer';
      change.onclick = () => {
        location.textContent = 'Example Linux server';
        const warning = document.createElement('p'); warning.textContent = 'Your notes will be saved on Example Linux server. Removing or replacing this server can cause data loss. Choose a separate backup destination after setup.';
        warning.style.cssText = 'line-height:1.7;color:var(--color-warning,#dbb870)'; change.replaceWith(warning);
      };
      form.append(location,change,actions);
    } else form.append(nameLabel,driveLabel,actions);
    dialog.append(heading,info,form);
    document.body.append(dialog); dialog.showModal(); (purpose === 'notebook' ? submit : name).focus();
  });
}
