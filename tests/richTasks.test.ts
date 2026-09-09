import {test,expect} from 'bun:test';
import {RichDocument,richSchema} from '../src/richDocument';
import {EditorState} from 'prosemirror-state';
import {splitListItem} from 'prosemirror-schema-list';
test('nested checked and unchecked tasks are semantic, ordinary lists remain ordinary',()=>{
 const source='- [x] Done\n  - [ ] Child\n- Ordinary\n- [ ]\n';const model=new RichDocument(source);
 const items:any[]=[];model.doc.descendants(node=>{if(node.type.name==='list_item')items.push(node)});
 expect(items.map(n=>n.attrs.checked)).toEqual([true,false,null,false]);
 expect(items[0].firstChild.textContent).toBe('Done');expect(model.serialize(model.doc)).toBe(source);
});
test('task toggle preserves text and metadata and serializes markers',()=>{
 const model=new RichDocument('- [ ] Buy milk <!-- task:abc -->\n');
 // HTML metadata remains protected rather than approximated.
 expect(model.doc.firstChild?.type.name).toBe('preserved');expect(model.serialize(model.doc)).toContain('task:abc');
 const plain=new RichDocument('- [ ] Buy milk\n');let state=EditorState.create({schema:richSchema,doc:plain.doc});
 state=state.apply(state.tr.setNodeMarkup(1,undefined,{checked:true}));
 expect(plain.serialize(state.doc)).toContain('[x] Buy milk');
});
test('escaped checkbox text is not interpreted as a task',()=>{
 const doc=new RichDocument('- \\[x] literal\n').doc;expect(doc.firstChild?.firstChild?.attrs.checked).toBeNull();
});
