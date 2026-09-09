import { EditorState, TextSelection, type Command, type Transaction } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { Plugin } from 'prosemirror-state';
import { Fragment, Slice, type Node as RichNode } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark, setBlockType, wrapIn } from 'prosemirror-commands';
import { wrapInList, splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { tableEditing, goToNextCell, addRowAfter, addColumnAfter, deleteRow, deleteColumn, TableView } from 'prosemirror-tables';
import { inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { RichDocument,richSchema } from './richDocument';
import type { WritingOptions } from './writingSurface';
import {linkedNoteId} from './backlinks';
import type { TextMatch } from './find';
type Selection={start:number;end:number};

export class WritingSurface {
 readonly view:EditorView;private model:RichDocument;private source:string;private locked=false;
 private styles:HTMLStyleElement;private matchRanges:TextMatch[]=[];private activeStart=0;
 private composing=0;private compositionActive=false;
 constructor(parent:HTMLElement,private options:WritingOptions){
  this.source=options.body;this.model=new RichDocument(options.body);this.locked=!!options.readOnly;
  this.styles=document.createElement('style');this.styles.textContent=styles;parent.append(this.styles);
  const undo=(redo=false):Command=>()=>{if(!this.locked)(redo?options.onRedo:options.onUndo)();return true;};
  const findPlugin=new Plugin({props:{decorations:state=>DecorationSet.create(state.doc,this.matchRanges.flatMap(match=>{
   const from=this.model.mapPosition(state.doc,match.start,'rich'),to=this.model.mapPosition(state.doc,match.end,'rich');return to>from?[Decoration.inline(from,to,{class:match.start===this.activeStart?'rich-match active':'rich-match'})]:[];
  }))}});
  this.view=new EditorView(parent,{state:EditorState.create({schema:richSchema,doc:this.model.doc,plugins:[
   inputRules({rules:[textblockTypeInputRule(/^(#{1,6})\s$/,richSchema.nodes.heading,m=>({level:m[1].length})),wrappingInputRule(/^\s*([-+*])\s$/,richSchema.nodes.bullet_list),wrappingInputRule(/^(\d+)\.\s$/,richSchema.nodes.ordered_list,m=>({order:Number(m[1])}))]}),
   keymap({'Shift-Enter':()=>this.inTableCell(),'Mod-Enter':()=>this.inTableCell(),'Mod-z':undo(),'Mod-y':undo(true),'Mod-Shift-z':undo(true),'Mod-b':toggleMark(richSchema.marks.strong),'Mod-i':toggleMark(richSchema.marks.em),Enter:(state,dispatch,view)=>{let task=false;for(let depth=state.selection.$from.depth;depth>0;depth--)if(state.selection.$from.node(depth).type===richSchema.nodes.list_item){task=state.selection.$from.node(depth).attrs.checked!==null;break;}return splitListItem(richSchema.nodes.list_item,task?{checked:false}:undefined)(state,dispatch,view);},Tab:(s,d,v)=>goToNextCell(1)(s,d,v)||sinkListItem(richSchema.nodes.list_item)(s,d,v),'Shift-Tab':(s,d,v)=>goToNextCell(-1)(s,d,v)||liftListItem(richSchema.nodes.list_item)(s,d,v)}),
   keymap(baseKeymap),tableEditing(),findPlugin,new Plugin({props:{handleTextInput:(view,from,to,_text,defaultTransaction)=>{if(this.locked)return true;view.dispatch(defaultTransaction().setMeta('rich-typing',from===to));return true;}}}),
  ]}),attributes:{class:'notes-rich-editor',role:'textbox','aria-label':'Rich text editor','aria-multiline':'true',spellcheck:'true'},editable:()=>!this.locked,
  nodeViews:{table:node=>new TableView(node,130),list_item:(node,view,getPos)=>{
   const dom=document.createElement('li');const contentDOM=document.createElement('div');
   let checkbox:HTMLInputElement|null=null;
   if(node.attrs.checked!==null){dom.className='rich-task';checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=node.attrs.checked;checkbox.contentEditable='false';checkbox.setAttribute('aria-label',node.firstChild?.textContent||'Complete task');checkbox.disabled=this.locked;
    checkbox.addEventListener('change',()=>{const pos=getPos();if(this.locked||pos===undefined){checkbox!.checked=node.attrs.checked;return;}view.dispatch(view.state.tr.setNodeMarkup(pos,undefined,{...node.attrs,checked:checkbox!.checked}).setMeta('rich-command',true));});dom.append(checkbox);
   }
   dom.append(contentDOM);return {dom,contentDOM,stopEvent:event=>event.target===checkbox,ignoreMutation:mutation=>mutation.type!=='selection'&&mutation.target===checkbox};
  }},
  dispatchTransaction:tr=>this.dispatch(tr),
  handlePaste:(view,event)=>{
   if(this.locked)return true;
   // Plain text is deliberately used until rich HTML import has a preservation contract.
   const text=event.clipboardData?.getData('text/plain');if(text===undefined)return false;
   const inCell = this.inTableCell();
   view.dispatch(view.state.tr.insertText(inCell ? text.replace(/[\r\n]+/g,' ') : text).setMeta('inputType','paste'));return true;
  },
  handleDrop:()=>true,
  handleDOMEvents:{compositionstart:()=>{this.compositionActive=true;this.composing++;return false;},compositionend:()=>{this.compositionActive=false;return false;},beforeinput:(_v,event)=>{const e=event as InputEvent;if(['historyUndo','historyRedo'].includes(e.inputType)){e.preventDefault();if(!this.locked)(e.inputType==='historyUndo'?options.onUndo:options.onRedo)();return true;}return false;},click:(_v,event)=>{if((event.target as Element).closest('a')){event.preventDefault();return true;}return false;}},
  });
 }
 private inTableCell(){
  const {$from}=this.view.state.selection;
  for(let depth=$from.depth;depth>0;depth--)if(['table_cell','table_header'].includes($from.node(depth).type.name))return true;
  return false;
 }
 private dispatch(tr:Transaction){
  if(this.locked&&tr.docChanged)return;
  const before=this.selection;const previous=this.view.state;
  const next=previous.applyTransaction(tr).state;
  const changed=!next.doc.eq(previous.doc);
  let source=this.source;
  // Validate before updating the view: unsupported mutations cannot leave unsaved rich-only content.
  if(changed){try{source=this.model.serialize(next.doc);}catch{return;}}
  this.view.updateState(next);
  if(changed){
   this.source=source;
   const after=this.selection;
   this.options.onChange({body:this.source,before,after,key:this.compositionActive?`composition:rich:${this.composing}`:tr.getMeta('inputType')==='paste'?null:tr.getMeta('uiEvent')==='paste'?null:tr.getMeta('rich-typing')&&!tr.getMeta('rich-command')?'insertText':null});
  }
 }
 private toSource(pos:number){return this.model.mapPosition(this.view.state.doc,pos,'source');}
 private toRich(pos:number){return this.model.mapPosition(this.view.state.doc,pos,'rich');}
 get body(){return this.source;}get value(){return this.source;}set value(v:string){this.setBody(v);}
 get selection(){return {start:this.toSource(this.view.state.selection.from),end:this.toSource(this.view.state.selection.to)};}
 get selectionStart(){return this.selection.start;}get selectionEnd(){return this.selection.end;}get readOnly(){return this.locked;}
 contains(target:EventTarget|null){return target instanceof Node&&this.view.dom.contains(target);}
 setSelectionRange(start:number,end:number){this.select(start,end);}
 select(start:number,end=start){this.view.dispatch(this.view.state.tr.setSelection(TextSelection.between(this.view.state.doc.resolve(this.toRich(start)),this.view.state.doc.resolve(this.toRich(end)))).scrollIntoView());}
 setBody(body:string,selection?:Selection){
  if(body===this.source)return;
  const previous=selection??this.selection;this.source=body;this.model=new RichDocument(body);
  this.view.updateState(EditorState.create({schema:richSchema,doc:this.model.doc,plugins:this.view.state.plugins}));this.select(previous.start,previous.end);
 }
 setReadOnly(value:boolean){this.locked=value;this.view.setProps({editable:()=>!this.locked});this.view.dom.setAttribute('aria-readonly',String(value));this.view.dom.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(input=>input.disabled=value);}
 setMatches(matches:TextMatch[],activeStart:number){this.matchRanges=matches;this.activeStart=activeStart;this.view.updateState(this.view.state);}
 command(command:Command){if(this.locked)return false;const result=command(this.view.state,tr=>this.view.dispatch(tr.setMeta('rich-command',true)),this.view);this.focus();return result;}
 table(action:'row'|'column'|'delete-row'|'delete-column'){return this.command(({row:addRowAfter,column:addColumnAfter,'delete-row':deleteRow,'delete-column':deleteColumn})[action]);}
 format(before:string,after='',prefix=false){
  const marks:Record<string,string>={'**':'strong','*':'em','~~':'strike','`':'code'};
  if(marks[before]&&before===after)return this.command(toggleMark(richSchema.marks[marks[before]]));
  if(prefix&&/^#{1,6} $/.test(before))return this.command(setBlockType(richSchema.nodes.heading,{level:before.trim().length}));
  if(prefix&&before==='> ')return this.command(wrapIn(richSchema.nodes.blockquote));
  if(prefix&&['- ','1. '].includes(before))return this.command(wrapInList(richSchema.nodes[before==='- '?'bullet_list':'ordered_list']));
  if(before.startsWith('\n```'))return this.command(setBlockType(richSchema.nodes.code_block,{params:'text'}));
  if(before.includes('| Column |')){
   const cell=(header:boolean)=>richSchema.nodes[header?'table_header':'table_cell'].createAndFill()!;
   const table=richSchema.nodes.table.create(null,[richSchema.nodes.table_row.create(null,[cell(true),cell(true)]),richSchema.nodes.table_row.create(null,[cell(false),cell(false)])]);
   return this.insertNodes(Fragment.from(table));
  }
  if(before.includes('---'))return this.insertNodes(Fragment.from(richSchema.nodes.horizontal_rule.create()));
  if(before==='[')return false;
  if(before==='- [ ] ')return this.checklist();
  // Supported Markdown insertion is parsed into nodes, not exposed as active-line syntax.
  const selected=this.view.state.doc.textBetween(this.view.state.selection.from,this.view.state.selection.to,'\n');
  return this.insertMarkdown(before+selected+after);
 }
 setLink(href:string){
  if((!/^https:\/\//i.test(href)&&!/^mailto:/i.test(href)&&!linkedNoteId(href))||/[\u0000-\u001f\u007f]/.test(href))return false;
  return this.command((state,dispatch)=>{if(state.selection.empty){dispatch?.(state.tr.replaceSelectionWith(richSchema.text(href,[richSchema.marks.link.create({href})]),false));return true;}dispatch?.(state.tr.addMark(state.selection.from,state.selection.to,richSchema.marks.link.create({href})));return true;});
 }
 checklist(){
  return this.command((state,dispatch,view)=>{
   const {$from}=state.selection;
   for(let depth=$from.depth;depth>0;depth--){const node=$from.node(depth);if(node.type===richSchema.nodes.list_item){dispatch?.(state.tr.setNodeMarkup($from.before(depth),undefined,{...node.attrs,checked:node.attrs.checked===null?false:null}));return true;}}
   return wrapInList(richSchema.nodes.bullet_list)(state,tr=>{
    const positions:number[]=[];tr.doc.nodesBetween(tr.selection.from,tr.selection.to,(node,pos)=>{if(node.type===richSchema.nodes.list_item)positions.push(pos);});
    // A collapsed selection still includes its ancestor list item.
    for(let depth=tr.selection.$from.depth;depth>0;depth--)if(tr.selection.$from.node(depth).type===richSchema.nodes.list_item)positions.push(tr.selection.$from.before(depth));
    for(const pos of new Set(positions))tr.setNodeMarkup(pos,undefined,{checked:false});dispatch?.(tr);
   },view);
  });
 }
 insertMarkdown(value:string){return this.insertNodes(new RichDocument(value).doc.content);}
 private insertNodes(content:Fragment){if(this.locked)return false;this.view.dispatch(this.view.state.tr.replaceSelection(new Slice(content,0,0)).setMeta('rich-command',true).scrollIntoView());this.focus();return true;}
 focus(){this.view.focus();}destroy(){this.view.destroy();this.styles.remove();}
}
const styles=`
.notes-rich-editor{height:100%;overflow:auto;outline:none;padding:24px;color:var(--ink);background:transparent;font:var(--notes-font-size,16px)/1.8 var(--font-sans,system-ui);white-space:pre-wrap;overflow-wrap:anywhere}
.notes-rich-editor li.rich-task{list-style:none;position:relative}.notes-rich-editor li.rich-task>input{position:absolute;left:-25px;top:7px;width:18px;height:18px;accent-color:var(--accent)}.notes-rich-editor p{margin:0 0 1em!important}.notes-rich-editor h1{font-size:1.8em!important}.notes-rich-editor h2{font-size:1.5em!important}.notes-rich-editor strong{font-weight:700}.notes-rich-editor em{font-style:italic}.notes-rich-editor ul{list-style:disc;padding-left:25px}.notes-rich-editor ol{list-style:decimal;padding-left:25px}.notes-rich-editor blockquote{border-left:3px solid var(--accent);padding-left:16px}.notes-rich-editor pre{background:var(--wash);padding:14px;border-radius:8px;white-space:pre;overflow:auto}.notes-rich-editor code{font-family:monospace}.notes-rich-editor .rich-link{color:var(--accent);text-decoration:underline}.notes-rich-editor .tableWrapper{max-width:100%;overflow-x:auto}.notes-rich-editor table{border-collapse:collapse;table-layout:fixed;width:max-content;min-width:100%}.notes-rich-editor td,.notes-rich-editor th{min-width:130px;border:1px solid var(--line);padding:8px;position:relative}.notes-rich-editor td p,.notes-rich-editor th p{margin:0!important}.notes-rich-editor .selectedCell:after{position:absolute;inset:0;background:#3b82f633;content:'';pointer-events:none}.notes-rich-editor .rich-protected{border:1px solid var(--line);border-radius:8px;padding:12px;font-size:13px}.notes-rich-editor .rich-protected pre{max-height:180px}.notes-rich-editor .rich-match{background:#e6b94055}.notes-rich-editor .rich-match.active{outline:2px solid var(--accent)}.notes-rich-editor ::selection{background:#2563eb;color:white}
`;
