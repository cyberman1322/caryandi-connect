import { describe, expect, test } from 'bun:test';
import { parseArticle, parseInline } from '../../src/lib/content/article-format';

describe('parseArticle', () => {
  test('headings, paragraphs and bullets', () => {
    expect(parseArticle('## Title\nOne line\nsame para\n\n- a\n- b')).toEqual([
      { type: 'heading', text: 'Title' },
      { type: 'paragraph', text: 'One line same para' },
      { type: 'list', items: ['a', 'b'] },
    ]);
  });

  test('subheadings and numbered steps', () => {
    expect(parseArticle('### Step\n1. First\n2) Second\nAfter')).toEqual([
      { type: 'subheading', text: 'Step' },
      { type: 'steps', items: ['First', 'Second'] },
      { type: 'paragraph', text: 'After' },
    ]);
  });

  test('tables skip the separator row and pad short rows', () => {
    expect(parseArticle('| Band | Fee |\n|---|---:|\n| Up to 800 kg | K440.00 |\n| Motorcycles |')).toEqual([
      { type: 'table', header: ['Band', 'Fee'], rows: [['Up to 800 kg', 'K440.00'], ['Motorcycles', '']] },
    ]);
  });

  test('a table ends at the next non-table line', () => {
    const blocks = parseArticle('| a | b |\n| 1 | 2 |\nNote below');
    expect(blocks.map((b) => b.type)).toEqual(['table', 'paragraph']);
  });
});

describe('parseInline', () => {
  test('bold parts', () => {
    expect(parseInline('Pay **K318.00** at RTSA')).toEqual([
      { text: 'Pay ', bold: false }, { text: 'K318.00', bold: true }, { text: ' at RTSA', bold: false },
    ]);
  });
  test('https links, without trailing punctuation', () => {
    expect(parseInline('See https://www.rtsa.org.zm/transport/registration/.')).toEqual([
      { text: 'See ', bold: false },
      { text: 'https://www.rtsa.org.zm/transport/registration/', bold: false, href: 'https://www.rtsa.org.zm/transport/registration/' },
      { text: '.', bold: false },
    ]);
  });
  test('unmatched markers stay as text', () => {
    expect(parseInline('a ** b')).toEqual([{ text: 'a ** b', bold: false }]);
  });
});
