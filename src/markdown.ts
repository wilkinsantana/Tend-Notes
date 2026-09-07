import { renderFormula } from './math';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
export const attachmentPattern = /^attachments\/[a-f0-9]{64}\.(?:png|jpg|gif|webp|ogg|webm|mp3|m4a|wav)$/;
export function youtubeId(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(host) ? (url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts)\/([^/]+)$/.exec(url.pathname)?.[1]) : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export interface Media {kind: 'image' | 'audio' | 'youtube'; url: string; label: string; local: boolean}
export function renderDocument(content: string): {html: string; media: Media[]} {
  const media: Media[] = [];
  const formulas: string[] = [];
  let formulaBytes = 0;
  const equation = (source: string, display: boolean) => {
    try { formulaBytes += source.length; if(formulas.length >= 256 || formulaBytes > 65536) throw new Error('Formula preview limit'); const index = formulas.push(renderFormula(source, display)) - 1; return `<span data-notes-math="${index}"></span>`; }
    catch { return `<code>${escape((display ? "$$" : "$") + source + (display ? "$$" : "$"))}</code>`; }
  };
  const placeholder = (item: Media) => {
    const index = media.push(item) - 1;
    return `<button type="button" data-notes-media="${index}">${escape(item.kind === 'youtube' ? 'Load YouTube video' : item.local ? `Open ${item.kind}: ${item.label}` : `Load external image: ${item.label}`)}</button>`;
  };
  const parser = new Marked({gfm:true, breaks:false, async:false, renderer:{
    // Source HTML cannot manufacture trusted media placeholders or executable elements.
    html({text}) { return escape(text); },
    image({href, text}) {
      const local = attachmentPattern.test(href);
      if (!local && !/^https:\/\//i.test(href)) return escape(text);
      return placeholder({kind:'image',url:href,label:text || 'Image',local});
    },
    link({href, text, tokens}) {
      const video = youtubeId(href);
      if (video) return placeholder({kind:'youtube',url:video,label:text || 'YouTube video',local:false});
      if (attachmentPattern.test(href)) return placeholder({kind:/\.(ogg|webm|mp3|m4a|wav)$/.test(href)?'audio':'image',url:href,label:text || 'Attachment',local:true});
      return /^(https:\/\/|mailto:)/i.test(href) ? `<a href="${escape(href)}" rel="noopener noreferrer" target="_blank">${this.parser.parseInline(tokens)}</a>` : escape(text);
    }
  }});
  parser.use({extensions:[
    {name:'displayMath',level:'block',start(src){return src.indexOf('$$');},tokenizer(src){
      const match=/^\$\$[ \t]*\n([\s\S]+?)\n\$\$[ \t]*(?:\n|$)/.exec(src);
      if(match) return {type:'displayMath',raw:match[0],text:match[1]};
    },renderer(token){return equation(token.text as string,true);}},
    {name:'inlineMath',level:'inline',start(src){return src.indexOf('$');},tokenizer(src){
      const match=/^\$(?![\s$])((?:\\.|[^$\n\\])+?)(?<!\s)\$(?![\d$])/.exec(src);
      if(match) return {type:'inlineMath',raw:match[0],text:match[1]};
    },renderer(token){return equation(token.text as string,false);}},
  ]});
  // Compatibility for inline bold produced by the old whitespace-blind toolbar.
  // Marked handles code spans/fences first; source bytes remain unchanged.
  parser.use({extensions:[{name:'legacyBold',level:'inline',start(src){return src.indexOf('**');},tokenizer(src){const match=/^\*\*([^*\n]+\S)[ \t]+\*\*/.exec(src);if(match)return {type:'legacyBold',raw:match[0],text:match[1]};},renderer(token){return `<strong>${escape(token.text as string)}</strong>`;}}]});
  const html = DOMPurify.sanitize(parser.parse(content) as string, {
    ALLOWED_TAGS:['p','br','hr','h1','h2','h3','h4','h5','h6','strong','em','del','blockquote','ul','ol','li','pre','code','a','table','thead','tbody','tr','th','td','input','button','span'],
    ALLOWED_ATTR:['href','title','type','checked','disabled','start','align','rel','target','data-notes-media','data-notes-math'],
    ADD_URI_SAFE_ATTR:['data-notes-media','data-notes-math','type'],
    ALLOWED_URI_REGEXP:/^(?:https:\/\/|mailto:)/i, ALLOW_DATA_ATTR:false,
  });
  return {html: html.replace(/<span data-notes-math="(\d+)"><\/span>/g, (_, index) => formulas[Number(index)] ?? ''),media};
}
export const renderMarkdown = (content: string) => renderDocument(content).html;
