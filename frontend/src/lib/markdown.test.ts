import { describe, it, expect } from 'vitest';
import {
  BULLET_PREFIX,
  NUMBER_PREFIX,
  QUOTE_PREFIX,
  TASK_PREFIX,
  continueBlock,
  headingPrefix,
  highlightMarkdown,
  indentLines,
  insertBlock,
  insertLink,
  linkPastedUrl,
  markdownStats,
  toggleLinePrefix,
  toggleWrap,
} from './markdown';

/** The mirror paints these tokens under a transparent textarea. */
const rebuilt = (source: string) =>
  highlightMarkdown(source)
    .map((t) => t.value)
    .join('');

const kinds = (source: string) => highlightMarkdown(source).map((t) => `${t.kind}:${t.value}`);

describe('highlightMarkdown', () => {
  it('reproduces the source exactly, or the highlight slides off the caret', () => {
    const source = [
      '# عنوان',
      '',
      'نص **عريض** و *مائل* و ~~مشطوب~~ مع `كود`.',
      '',
      '- [ ] مهمة',
      '- [x] منجزة',
      '',
      '> اقتباس',
      '',
      '| أ | ب |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```sql',
      'SELECT * FROM tickets;',
      '```',
      '',
      '[رابط](https://example.com) و https://bare.example.com',
      '',
      '---',
    ].join('\n');

    expect(rebuilt(source)).toBe(source);
  });

  it('keeps every character of an empty document and of trailing newlines', () => {
    expect(rebuilt('')).toBe('');
    expect(rebuilt('\n\n\n')).toBe('\n\n\n');
    expect(rebuilt('نص\n')).toBe('نص\n');
  });

  it('marks heading syntax apart from heading text', () => {
    expect(kinds('## عنوان')).toEqual(['marker:## ', 'heading:عنوان']);
  });

  it('treats the whole fence body as code, syntax and all', () => {
    const tokens = highlightMarkdown('```ts\n# not a heading\n```');
    expect(tokens.map((t) => t.kind)).toEqual(['marker', 'text', 'code', 'text', 'marker']);
  });

  it('reads a task box separately from the bullet', () => {
    expect(kinds('- [x] تم')).toEqual(['marker:- ', 'task:[x] ', 'text:تم']);
  });

  it('splits a link into label and url', () => {
    expect(kinds('[نص](https://a.b)')).toEqual([
      'marker:[',
      'link:نص',
      'marker:](',
      'url:https://a.b',
      'marker:)',
    ]);
  });

  it('leaves an escaped asterisk as plain text', () => {
    expect(kinds('\\*ليس مائلاً\\*')).toEqual(['text:\\*ليس مائلاً\\*']);
  });
});

describe('toggleWrap', () => {
  it('wraps the selection', () => {
    expect(toggleWrap('نص مهم', { start: 3, end: 6 }, '**')).toEqual({
      value: 'نص **مهم**',
      start: 5,
      end: 8,
    });
  });

  it('unwraps when the markers are already inside the selection', () => {
    expect(toggleWrap('**مهم**', { start: 0, end: 7 }, '**')).toMatchObject({ value: 'مهم' });
  });

  it('unwraps when the markers sit just outside it', () => {
    expect(toggleWrap('**مهم**', { start: 2, end: 5 }, '**')).toMatchObject({ value: 'مهم' });
  });

  it('leaves trailing spaces outside the markers', () => {
    expect(toggleWrap('نص مهم ', { start: 3, end: 7 }, '**')).toMatchObject({
      value: 'نص **مهم** ',
    });
  });

  it('drops the caret between the markers when nothing is selected', () => {
    expect(toggleWrap('', { start: 0, end: 0 }, '`')).toEqual({ value: '``', start: 1, end: 1 });
  });
});

describe('toggleLinePrefix', () => {
  it('adds a bullet to every line the selection touches', () => {
    const result = toggleLinePrefix('أ\nب', { start: 0, end: 3 }, BULLET_PREFIX);
    expect(result.value).toBe('- أ\n- ب');
  });

  it('removes the bullet when every line already has one', () => {
    const result = toggleLinePrefix('- أ\n- ب', { start: 0, end: 7 }, BULLET_PREFIX);
    expect(result.value).toBe('أ\nب');
  });

  it('numbers an ordered list from one', () => {
    const result = toggleLinePrefix('أ\nب\nج', { start: 0, end: 5 }, NUMBER_PREFIX);
    expect(result.value).toBe('1. أ\n2. ب\n3. ج');
  });

  it('converts a bullet list instead of stacking two markers', () => {
    const result = toggleLinePrefix('- أ', { start: 0, end: 3 }, NUMBER_PREFIX);
    expect(result.value).toBe('1. أ');
  });

  it('converts a bullet into a task box', () => {
    const result = toggleLinePrefix('- أ', { start: 0, end: 3 }, TASK_PREFIX);
    expect(result.value).toBe('- [ ] أ');
  });

  it('swaps one heading level for another', () => {
    const result = toggleLinePrefix('## عنوان', { start: 0, end: 0 }, headingPrefix(3));
    expect(result.value).toBe('### عنوان');
  });

  it('keeps indentation when it adds a quote', () => {
    const result = toggleLinePrefix('  نص', { start: 0, end: 0 }, QUOTE_PREFIX);
    expect(result.value).toBe('  > نص');
  });
});

describe('continueBlock', () => {
  it('carries the bullet to the next line', () => {
    const result = continueBlock('- أ', 3);
    expect(result).toMatchObject({ value: '- أ\n- ' });
  });

  it('increments an ordered list', () => {
    const result = continueBlock('3. ثالث', 7);
    expect(result).toMatchObject({ value: '3. ثالث\n4. ' });
  });

  it('carries an unchecked box, never the checked state', () => {
    const result = continueBlock('- [x] تم', 8);
    expect(result).toMatchObject({ value: '- [x] تم\n- [ ] ' });
  });

  it('clears the marker on an empty item so the list ends', () => {
    const result = continueBlock('- أ\n- ', 6);
    expect(result).toMatchObject({ value: '- أ\n', start: 4 });
  });

  it('outdents a nested empty item before clearing it', () => {
    const result = continueBlock('- أ\n  - ', 8);
    expect(result).toMatchObject({ value: '- أ\n' });
  });

  it('continues a quote', () => {
    expect(continueBlock('> نص', 4)).toMatchObject({ value: '> نص\n> ' });
  });

  it('stays out of the way in ordinary prose', () => {
    expect(continueBlock('نص عادي', 7)).toBeNull();
  });
});

describe('indentLines', () => {
  it('indents every line of the selection', () => {
    expect(indentLines('- أ\n- ب', { start: 0, end: 7 }, false).value).toBe('  - أ\n  - ب');
  });

  it('outdents by the same step', () => {
    expect(indentLines('  - أ', { start: 5, end: 5 }, true).value).toBe('- أ');
  });

  it('never outdents past the start of the line', () => {
    const result = indentLines('- أ', { start: 0, end: 0 }, true);
    expect(result).toMatchObject({ value: '- أ', start: 0 });
  });
});

describe('insertBlock', () => {
  it('opens a fence on its own line with the caret inside', () => {
    const result = insertBlock('', { start: 0, end: 0 }, '```\n$0\n```');
    expect(result.value).toBe('```\n\n```');
    expect(result.start).toBe(4);
  });

  it('pushes the block below a line that already has text', () => {
    const result = insertBlock('نص', { start: 2, end: 2 }, '---');
    expect(result.value).toBe('نص\n\n---');
  });
});

describe('insertLink', () => {
  it('keeps the selection as the label and waits on the url', () => {
    const result = insertLink('برمجلي', { start: 0, end: 6 });
    expect(result.value).toBe('[برمجلي]()');
    expect(result.start).toBe(9);
  });

  it('puts the caret in the label when nothing is selected', () => {
    expect(insertLink('', { start: 0, end: 0 })).toEqual({ value: '[]()', start: 1, end: 1 });
  });
});

describe('linkPastedUrl', () => {
  it('links a url pasted over selected text', () => {
    const result = linkPastedUrl('افتح الرابط', { start: 5, end: 11 }, 'https://brm.sa');
    expect(result?.value).toBe('افتح [الرابط](https://brm.sa)');
  });

  it('leaves a plain paste alone', () => {
    expect(linkPastedUrl('نص', { start: 0, end: 2 }, 'كلمة')).toBeNull();
  });

  it('leaves a paste with no selection alone', () => {
    expect(linkPastedUrl('نص', { start: 2, end: 2 }, 'https://brm.sa')).toBeNull();
  });

  it('does not nest a url inside a url', () => {
    expect(linkPastedUrl('https://a.b', { start: 0, end: 11 }, 'https://c.d')).toBeNull();
  });
});

describe('markdownStats', () => {
  it('counts words and characters', () => {
    expect(markdownStats('  كلمة أخرى  ')).toEqual({ words: 2, chars: 13 });
  });

  it('reports nothing for an empty document', () => {
    expect(markdownStats('   ')).toEqual({ words: 0, chars: 3 });
  });
});
