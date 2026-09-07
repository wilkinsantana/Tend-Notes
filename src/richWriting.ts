/** Rich presentation over exact Markdown bytes; editing never round-trips through HTML. */
import { Decoration, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';

class Bullet extends WidgetType {
  toDOM() { const node=document.createElement('span');node.textContent='•';node.className='notes-rich-bullet';return node; }
}
class Checkbox extends WidgetType {
  constructor(readonly from:number,readonly checked:boolean,readonly label:string){super();}
  toDOM(view:EditorView) {
    const input=document.createElement('input');input.type='checkbox';input.checked=this.checked;
    input.disabled=view.state.readOnly;input.setAttribute('aria-label',this.label || 'Checklist item');
    input.addEventListener('mousedown',event=>event.preventDefault());
    input.addEventListener('change',()=>{if(!view.state.readOnly)view.dispatch({changes:{from:this.from+1,to:this.from+2,insert:input.checked?'x':' '},userEvent:'input'});});
    return input;
  }
  ignoreEvent(){return true;}
}
function decorate(view:EditorView) {
  const marks:Range<Decoration>[]=[];
  const selection=view.state.selection.main;
  const first=view.state.doc.lineAt(selection.from).number, last=view.state.doc.lineAt(selection.to).number;
  for(const visible of view.visibleRanges) syntaxTree(view.state).iterate({from:visible.from,to:visible.to,enter(node){
    const line=view.state.doc.lineAt(node.from);
    // Reveal the active line's syntax for precise cursor movement and editing.
    if(line.number>=first && line.number<=last) return;
    if(node.name==='TaskMarker'){marks.push(Decoration.replace({widget:new Checkbox(node.from,view.state.doc.sliceString(node.from+1,node.from+2).toLowerCase()==='x',view.state.doc.sliceString(node.to,line.to).trim())}).range(node.from,node.to));}
    else if(['HeaderMark','EmphasisMark','StrikethroughMark','CodeMark','QuoteMark'].includes(node.name)) {
      marks.push(Decoration.replace({}).range(node.from,node.to));
    } else if(node.name==='ListMark' && /^[-+*]$/.test(view.state.doc.sliceString(node.from,node.to))) {
      marks.push(Decoration.replace({widget:new Bullet()}).range(node.from,node.to));
    }
  }});
  return Decoration.set(marks,true);
}
export const richWriting = ViewPlugin.fromClass(class {
  decorations;
  constructor(view:EditorView){this.decorations=decorate(view);}
  update(update:ViewUpdate){if(update.startState.readOnly !== update.state.readOnly || update.docChanged || update.selectionSet || update.viewportChanged || syntaxTree(update.startState)!==syntaxTree(update.state))this.decorations=decorate(update.view);}
},{decorations:plugin=>plugin.decorations});
