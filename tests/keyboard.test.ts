import {test, expect} from 'bun:test';
import {markdownNewline} from '../src/keyboard';
function enter(body: string, start=body.length, end=start) {
  const edit=markdownNewline(body,start,end);
  return edit ? body.slice(0,edit.from)+edit.text+body.slice(edit.to) : null;
}
test('continues numbered lists, bullets and fresh unchecked tasks',()=>{
  for(const [before,after] of [
    ['1. First','1. First\n2. '],['9) Ninth','9) Ninth\n10) '],
    ['  12. Nested','  12. Nested\n  13. '],['- One','- One\n- '],
    ['* One','* One\n* '],['+ One','+ One\n+ '],
    ['- [x] Done','- [x] Done\n- [ ] '],['1. [X] Done','1. [X] Done\n2. [ ] '],
    ['> 2. Two','> 2. Two\n> 3. '],['> > Quote','> > Quote\n> > '],
  ]) expect(enter(before)).toBe(after);
});
test('empty markers exit and do not consume neighboring lines',()=>{
  expect(enter('1. One\n2. ')).toBe('1. One\n\n');
  expect(enter('- [ ] ')).toBe('');
  expect(enter('- [ ]')).toBe('');
  expect(enter('> Quote\n> ')).toBe('> Quote\n\n');
  expect(enter('> - ')).toBe('> ');
  expect(enter('> > ')).toBe('> ');
  expect(enter('> ')).toBe('');
  expect(enter('- \nKeep',2)).toBe('\nKeep');
  expect(enter('  - ')).toBe('  ');
});
test('mid-line Enter preserves trailing text and replaces only the selection',()=>{
  expect(enter('1. First second',8)).toBe('1. First\n2.  second');
  expect(enter('- First remove last',8,15)).toBe('- First \n- last');
  expect(enter('1. One\n2. Two',2,10)).toBeNull();
  expect(enter('12. First',1)).toBeNull();
  expect(enter('  - First',1)).toBeNull();
});
test('code fences retain indentation without continuing Markdown-looking code',()=>{
  expect(enter('```md\n1. Code')).toBeNull();
  expect(enter('~~~md\n  - Code')).toBe('~~~md\n  - Code\n  ');
  expect(enter('````md\n```\n- Code')).toBeNull();
  expect(enter('```md\ncode\n```\n1. List')).toBe('```md\ncode\n```\n1. List\n2. ');
  expect(enter('> ```md\n> - Code')).toBe('> ```md\n> - Code\n> ');
  expect(enter('  const n = 1;')).toBe('  const n = 1;\n  ');
});
test('ordinary Markdown and pasted blocks do not invent repeat commands',()=>{
  for(const body of ['# Heading','**Bold**','---','* * *','- - -','Paragraph','']) expect(enter(body)).toBeNull();
  expect(enter('- Words',0)).toBeNull();
});
