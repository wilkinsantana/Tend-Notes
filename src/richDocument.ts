import MarkdownIt from 'markdown-it';
import Token from 'markdown-it/lib/token.mjs';
import { Schema, type Node as RichNode, type NodeSpec } from 'prosemirror-model';
import { schema as commonSchema, defaultMarkdownParser, MarkdownParser, defaultMarkdownSerializer, MarkdownSerializer } from 'prosemirror-markdown';
import { tableNodes } from 'prosemirror-tables';

// No remote resource loads or executable HTML in the editing representation.
const raw: NodeSpec = {group:'block',atom:true,isolating:true,attrs:{source:{default:''}},
  toDOM:node=>['div',{'class':'rich-protected','contenteditable':'false'},['strong','Preserved Markdown block'],['pre',node.attrs.source]],parseDOM:[]};
let nodes=commonSchema.spec.nodes.update('image',{...commonSchema.spec.nodes.get('image')!,toDOM:node=>['span',{'class':'rich-image-placeholder'},node.attrs.alt||'Image'],parseDOM:[]}).addToEnd('preserved',raw);
const tables=tableNodes({tableGroup:'block',cellContent:'paragraph',cellAttributes:{align:{default:null,getFromDOM:dom=>dom.style.textAlign||null,setDOMAttr:(value,attrs)=>{if(['left','center','right'].includes(String(value)))attrs.style=`text-align:${value}`;}}}});
nodes=nodes.append(tables).update('bullet_list',{...commonSchema.spec.nodes.get('bullet_list')!,attrs:{...commonSchema.spec.nodes.get('bullet_list')!.attrs,bullet:{default:'-'}}}).update('list_item',{...commonSchema.spec.nodes.get('list_item')!,attrs:{checked:{default:null}}});
const safeLink={...commonSchema.spec.marks.get('link')!,toDOM:()=>['span',{'class':'rich-link'},0] as const,parseDOM:[]};
export const richSchema=new Schema({nodes,marks:commonSchema.spec.marks.update('link',safeLink).addToEnd('strike',{parseDOM:[{tag:'s'},{tag:'del'}],toDOM:()=>['s',0]})});
const tokenizer=new MarkdownIt('commonmark',{html:true,linkify:false}).enable(['table','strikethrough']);
const specs={...defaultMarkdownParser.tokens};delete specs.image;
const parser=new MarkdownParser(richSchema,tokenizer,{
 ...specs,bullet_list:{...specs.bullet_list,getAttrs:(token,tokens,index)=>({...specs.bullet_list.getAttrs?.(token,tokens,index),bullet:token.markup})},list_item:{block:'list_item',getAttrs:token=>({checked:token.meta?.checked??null})},s:{mark:'strike'},table:{block:'table'},thead:{ignore:true},tbody:{ignore:true},tr:{block:'table_row'},
 th:{block:'table_header',getAttrs:token=>({align:token.attrGet('style')?.match(/text-align:(left|right|center)/)?.[1]??null})},
 td:{block:'table_cell',getAttrs:token=>({align:token.attrGet('style')?.match(/text-align:(left|right|center)/)?.[1]??null})},
});
// Markdown table tokens place inline directly inside cells; supply paragraph wrappers.
const parseBase=tokenizer.parse.bind(tokenizer);
tokenizer.parse=(source,env)=>{
 const tokens=parseBase(source,env);const result:typeof tokens=[];
 for(let i=0;i<tokens.length;i++){
  if(tokens[i].type!=='list_item_open'||tokens[i+1]?.type!=='paragraph_open'||tokens[i+2]?.type!=='inline')continue;
  const inline=tokens[i+2],match=/^\[([ xX])\](?: |$)/.exec(inline.content),first=inline.children?.[0];
  if(match&&first?.type==='text'&&first.content.startsWith(match[0])){
   tokens[i].meta={checked:match[1]!==' '};first.content=first.content.slice(match[0].length);
  }
 }
 for(const token of tokens){
  if(token.type==='th_close'||token.type==='td_close'){const p=new Token('paragraph_close','p',-1);result.push(p);}
  result.push(token);
  if(token.type==='th_open'||token.type==='td_open'){const p=new Token('paragraph_open','p',1);result.push(p);}
 }
 return result;
};
const frontmatter = (source:string) => /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(source)?.[0] ?? '';
function unsupported(source:string){
 // Preserve rich constructs that do not yet have a lossless typed representation.
 return !!frontmatter(source) || /!\[|<[^>]+>|\$|\[\^|\[\[|^\s*\[[^\]]+\]:/m.test(source);
}
export const richSerializer=new MarkdownSerializer({...defaultMarkdownSerializer.nodes,
 list_item:(state,node)=>{if(node.attrs.checked!==null)state.write(node.attrs.checked?'[x] ':'[ ] ');state.renderContent(node);},
 preserved:(state,node)=>{state.write(node.attrs.source);state.closeBlock(node);},
 table:(state,node)=>{
  const rows:string[][]=[];node.forEach(row=>{const cells:string[]=[];row.forEach(cell=>{
   let unsupportedBreak = false;
   cell.descendants(child => { if(child.type.name === 'hard_break' || (child.isText && /[\r\n]/.test(child.text!))) unsupportedBreak = true; });
   if(unsupportedBreak) throw new Error('Line breaks inside Markdown table cells are not supported.');
   const doc=richSchema.nodes.doc.create(null,cell.content);
   cells.push(richSerializer.serialize(doc).trim().replace(/\r?\n/g,' ').replace(/\|/g,'\\|'));
  });rows.push(cells);});
  if(!rows.length)return;
  state.write('| '+rows[0].join(' | ')+' |\n');
  const alignment:string[]=[];node.firstChild!.forEach(cell=>alignment.push(cell.attrs.align==='center'?':---:':cell.attrs.align==='right'?'---:':cell.attrs.align==='left'?':---':'---'));
  state.write('| '+alignment.join(' | ')+' |');
  for(const row of rows.slice(1))state.write('\n| '+row.join(' | ')+' |');
  state.closeBlock(node);
 },
}, {...defaultMarkdownSerializer.marks,strike:{open:'~~',close:'~~',mixable:true,expelEnclosingWhitespace:true}});
export interface SourceBlock {node:RichNode;raw:string;prefix:string;start:number}
/** Keeps untouched source bytes; conversion alone never produces a save. */
export class RichDocument {
 readonly doc:RichNode;readonly blocks:SourceBlock[]=[];private suffix='';
 constructor(readonly source:string){
  const lines=source.split(/(?<=\n)/);const offsets=[0];for(const line of lines)offsets.push(offsets.at(-1)!+line.length);
  const tokens=parseBase(source,{});let depth=0;const ranges:Array<[number,number]>=[];
  for(const token of tokens){if(depth===0&&token.map){const start=offsets[token.map[0]]??source.length,end=offsets[token.map[1]]??source.length;if(!ranges.length||start>=ranges.at(-1)![1])ranges.push([start,end]);}depth+=token.nesting;}
  const metadata=frontmatter(source);
  if(metadata){for(let i=ranges.length-1;i>=0;i--)if(ranges[i][0]<metadata.length)ranges.splice(i,1);ranges.unshift([0,metadata.length]);}
  let cursor=0;
  for(const [start,end] of ranges){
   const raw=source.slice(start,end);let node:RichNode;
   try{const parsed=unsupported(raw)?null:parser.parse(raw);node=parsed?.childCount===1?parsed.firstChild!:richSchema.nodes.preserved.create({source:raw});}catch{node=richSchema.nodes.preserved.create({source:raw});}
   this.blocks.push({node,raw,prefix:source.slice(cursor,start),start});cursor=end;
  }
  this.suffix=source.slice(cursor);
  // Reference definitions can be consumed silently by Markdown parsers: preserve whole source.
  if(!ranges.length&&source.trim() || /^\s*\[[^\]]+\]:/m.test(source)){
   this.blocks=[{node:richSchema.nodes.preserved.create({source}),raw:source,prefix:'',start:0}];this.suffix='';
  }
  this.doc=richSchema.nodes.doc.create(null,this.blocks.length?this.blocks.map(b=>b.node):richSchema.nodes.paragraph.create());
 }
 serialize(doc:RichNode):string{
  if(doc.eq(this.doc))return this.source;
  return this.layout(doc).source;
 }
 layout(doc:RichNode):{source:string;ranges:Array<{start:number;end:number;rich:number;node:RichNode}>}{
  const ranges:Array<{start:number;end:number;rich:number;node:RichNode}>=[];
  const used=new Set<SourceBlock>();let output='';
  doc.forEach((node,offset,index)=>{
   const original=this.blocks.find(b=>!used.has(b)&&(b.node===node||b.node.eq(node)));
   let start:number;
   if(original){used.add(original);if(output&&!output.endsWith('\n')&&!original.prefix.startsWith('\n'))output+='\n\n';output+=original.prefix;start=output.length;output+=original.raw;}
   else{if(output&&!output.endsWith('\n\n'))output+=output.endsWith('\n')?'\n':'\n\n';start=output.length;output+=richSerializer.serialize(richSchema.nodes.doc.create(null,node));if(index<doc.childCount-1)output+='\n\n';}
   ranges.push({start,end:output.length,rich:offset,node});
  });
  return {source:output+this.suffix,ranges};
 }
 /** Source navigation is block-local; decoded/escaped text falls back within its block. */
 mapPosition(doc:RichNode,position:number,direction:'source'|'rich'):number{
  const {source,ranges}=this.layout(doc);
  if(!ranges.length)return direction==='source'?0:Math.min(1,doc.content.size);
  const range=direction==='source'
   ? ranges.find(r=>position>=r.rich&&position<r.rich+r.node.nodeSize)??ranges.at(-1)!
   : ranges.find(r=>position>=r.start&&position<r.end)??ranges.find(r=>position<r.start)??ranges.at(-1)!;
  const points:Array<{rich:number;source:number}>=[];let cursor=range.start;
  const textblocks:Array<{start:number;end:number}>=[];
  range.node.descendants((node,pos)=>{
   const rich=range.rich+1+pos;
   if(node.isTextblock){
    textblocks.push({start:rich+1,end:rich+1+node.content.size});
    if(!node.content.size){
     const newline=source.indexOf('\n',cursor);
     const lineStart=newline>=0&&newline<range.end?newline+1:cursor;
     const end=source.indexOf('\n',lineStart);
     points.push({rich:rich+1,source:Math.min(end>=0?end:range.end,range.end)});
    }
   }
   if(!node.isText)return;
   let text=node.text!,at=source.indexOf(text,cursor);
   // Whitespace at the typing caret can be trimmed by Markdown serialization.
   while(text.length&&(at<cursor||at+text.length>range.end)){text=text.slice(0,-1);at=text?source.indexOf(text,cursor):-1;}
   if(text&&at>=cursor&&at+text.length<=range.end){for(let i=0;i<=node.text!.length;i++)points.push({rich:rich+i,source:at+Math.min(i,text.length)});cursor=at+text.length;}
  });
  if(direction==='source'){
   const block=textblocks.find(b=>position>=b.start&&position<=b.end);
   if(block){const local=points.filter(p=>p.rich>=block.start&&p.rich<=block.end);if(local.length)return local.reduce((best,item)=>Math.abs(item.rich-position)<Math.abs(best.rich-position)?item:best,local[0]).source;return range.start;}
  }
  if(!points.length)return direction==='source'?range.start:Math.min(range.rich+1,doc.content.size);
  const from=direction==='source'?'rich':'source',to=direction;
  return points.reduce((best,item)=>Math.abs(item[from]-position)<Math.abs(best[from]-position)?item:best,points[0])[to];
 }
}
