import {test,expect} from 'bun:test';
import {RichDocument,richSchema} from '../src/richDocument';
for(const source of ['# Heading\n\n**bold** and _italic_\n','- one\n  - two\n','a\n\n\n\nb\n','$$x^2$$\n\nText\n','<script>bad()</script>\n','[reference]: https://example.org\n\n[a][reference]\n','![image](https://example.org/a.png)\n','| A | B |\n| --- | ---: |\n| one | two |\n']){
 test('no-op preserves source '+source.slice(0,20),()=>{const d=new RichDocument(source);expect(d.serialize(d.doc)).toBe(source);});
}
test('table is a typed table, not raw',()=>{const d=new RichDocument('| A | B |\n| --- | --- |\n| one | two |');expect(d.doc.firstChild?.type.name).toBe('table');expect(d.doc.firstChild?.childCount).toBe(2);});
test('editing another block preserves unsupported source',()=>{const d=new RichDocument('$$x^2$$\n\nHello');const doc=richSchema.nodes.doc.create(null,[d.doc.firstChild!,richSchema.nodes.paragraph.create(null,richSchema.text('Changed'))]);expect(d.serialize(doc)).toContain('$$x^2$$');expect(d.serialize(doc)).toContain('Changed');});
