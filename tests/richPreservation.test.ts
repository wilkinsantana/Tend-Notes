import {test,expect} from 'bun:test';
import {RichDocument,richSchema,richSerializer} from '../src/richDocument';
test('entity and escaped source caret mapping stays in its own block',()=>{
 const model=new RichDocument('hello &amp; world\n\nsecond');
 expect(model.mapPosition(model.doc,3,'source')).toBeLessThan(18);
 expect(model.mapPosition(model.doc,5,'rich')).toBeLessThan(15);
 const escaped=new RichDocument('hello \\* world\n\nsecond');
 expect(escaped.mapPosition(escaped.doc,3,'source')).toBeLessThan(16);
});
test('untouched repeated paragraphs retain independent block cursor ranges',()=>{
 const model=new RichDocument('same\n\nsame');
 expect(model.mapPosition(model.doc,8,'source')).toBe(7);
 expect(model.mapPosition(model.doc,7,'rich')).toBe(8);
});
test('serializer rejects hard breaks and literal newlines in table cells',()=>{
 for(const content of [[richSchema.text('one'),richSchema.nodes.hard_break.create(),richSchema.text('two')],[richSchema.text('one\ntwo')]]){
 const cell=richSchema.nodes.table_header.create(null,richSchema.nodes.paragraph.create(null,content));
 const table=richSchema.nodes.table.create(null,richSchema.nodes.table_row.create(null,cell));
 expect(()=>richSerializer.serialize(richSchema.nodes.doc.create(null,table))).toThrow('Line breaks');
 }
});
test('YAML frontmatter remains protected while body edits preserve metadata',()=>{
 const source='---\ntitle: Original\ntags: [one]\n---\n\nText';const model=new RichDocument(source);
 expect(model.doc.firstChild?.type.name).toBe('preserved');expect(model.doc.child(1).textContent).toBe('Text');
 const doc=richSchema.nodes.doc.create(null,[model.doc.firstChild!,richSchema.nodes.paragraph.create(null,richSchema.text('Changed'))]);
 expect(model.serialize(doc)).toBe(source.replace('Text','Changed'));
});
test('table literal backslash and pipe survive another cell edit',()=>{
 const source=String.raw`| A | B |
| --- | --- |
| a\\\|b | second |`;
 const model=new RichDocument(source);const table=model.doc.firstChild!;
 const header=richSchema.nodes.table_header.create(null,richSchema.nodes.paragraph.create(null,richSchema.text('Changed')));
 const row=richSchema.nodes.table_row.create(null,[header,table.firstChild!.child(1)]);
 const changed=richSchema.nodes.doc.create(null,richSchema.nodes.table.create(null,[row,table.child(1)]));
 const reread=new RichDocument(model.serialize(changed));
 expect(reread.doc.firstChild!.child(1).firstChild!.textContent).toBe(table.child(1).firstChild!.textContent);
});
