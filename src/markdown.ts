import { Marked } from 'marked';
import DOMPurify from 'dompurify';
const parser = new Marked({ gfm: true, breaks: false, async: false });
/** A deliberately small HTML vocabulary; notes cannot load remote images. */
export function renderMarkdown(content: string): string {
  return DOMPurify.sanitize(parser.parse(content) as string, {
    ALLOWED_TAGS: ['p','br','hr','h1','h2','h3','h4','h5','h6','strong','em','del','blockquote','ul','ol','li','pre','code','a','table','thead','tbody','tr','th','td','input'],
    ALLOWED_ATTR: ['href','title','type','checked','disabled','start','align'],
    ALLOWED_URI_REGEXP: /^(?:https:\/\/|mailto:)/i,
    ALLOW_DATA_ATTR: false,
  });
}
