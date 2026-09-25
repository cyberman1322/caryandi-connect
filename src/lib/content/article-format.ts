/**
 * Article text format (kept deliberately small so admins can write it by hand):
 *   "## "  heading            "### " subheading
 *   "- "   bullet             "1. "  numbered step
 *   "| a | b |" table row — the first row is the header; a "|---|---|" row is ignored
 *   "**bold**" inside any text
 *   Blank lines separate paragraphs.
 */
export type ArticleBlock =
  | { type: 'heading'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] };

export type InlinePart = { text: string; bold: boolean; href?: string };

const SEPARATOR_ROW = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

function splitRow(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

export function parseArticle(text: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let steps: string[] = [];
  let table: string[][] = [];

  const flushPara = () => { if (para.length) { blocks.push({ type: 'paragraph', text: para.join(' ') }); para = []; } };
  const flushList = () => { if (list.length) { blocks.push({ type: 'list', items: list }); list = []; } };
  const flushSteps = () => { if (steps.length) { blocks.push({ type: 'steps', items: steps }); steps = []; } };
  const flushTable = () => {
    if (table.length) {
      const [header, ...rows] = table;
      const width = header.length;
      blocks.push({ type: 'table', header, rows: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')) });
      table = [];
    }
  };
  const flushAll = () => { flushPara(); flushList(); flushSteps(); flushTable(); };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flushAll(); continue; }
    if (line.startsWith('|')) {
      flushPara(); flushList(); flushSteps();
      if (!SEPARATOR_ROW.test(line)) table.push(splitRow(line));
      continue;
    }
    flushTable();
    if (line.startsWith('### ')) { flushAll(); blocks.push({ type: 'subheading', text: line.slice(4).trim() }); continue; }
    if (line.startsWith('## ')) { flushAll(); blocks.push({ type: 'heading', text: line.slice(3).trim() }); continue; }
    if (line.startsWith('- ')) { flushPara(); flushSteps(); list.push(line.slice(2).trim()); continue; }
    const step = /^\d+[.)]\s+(.*)$/.exec(line);
    if (step) { flushPara(); flushList(); steps.push(step[1].trim()); continue; }
    flushList(); flushSteps();
    para.push(line);
  }
  flushAll();
  return blocks;
}

/** Splits "**bold**" markers and bare https:// links into parts; unmatched markers are left as text. */
export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const re = /\*\*(.+?)\*\*|(https:\/\/[^\s)]+[^\s).,;:])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), bold: false });
    if (m[1] !== undefined) parts.push({ text: m[1], bold: true });
    else parts.push({ text: m[2], bold: false, href: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts;
}
