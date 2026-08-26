import { describe, it, expect } from 'vitest';
import {
  applyMention,
  encodeWritingDir,
  findMentionQuery,
  inferWritingDir,
  matchesMentionQuery,
  mentionToken,
  mentionedIdsIn,
  splitMentions,
  type MentionUser,
} from './mentions';

const ahmad: MentionUser = { id: 'u1', firstName: 'أحمد', lastName: 'علي', email: 'ahmad@brm.sa', role: 'DEVELOPER' };
const sara: MentionUser = { id: 'u2', firstName: 'Sara', lastName: 'Khan', email: 'sara@brm.sa', role: 'QA' };
const users = [ahmad, sara];

describe('splitMentions', () => {
  it('resolves an Arabic name — the old \\w regex never matched Arabic letters', () => {
    const segments = splitMentions('مرحباً @أحمد علي، راجع الطلب', users);
    expect(segments).toEqual([
      { type: 'text', value: 'مرحباً ' },
      { type: 'mention', value: '@أحمد علي', user: ahmad },
      { type: 'text', value: '، راجع الطلب' },
    ]);
  });

  it('resolves a Latin name inside an Arabic sentence', () => {
    const segments = splitMentions('من فضلك @Sara Khan راجعي هذا', users);
    expect(segments[1]).toEqual({ type: 'mention', value: '@Sara Khan', user: sara });
  });

  it('keeps a half-deleted mention as plain text', () => {
    const segments = splitMentions('مرحباً @أحمد ع', users);
    expect(segments.every((s) => s.type === 'text')).toBe(true);
  });

  it('keeps a mention of somebody outside the list as plain text', () => {
    const segments = splitMentions('@Unknown Person hello', users);
    expect(segments.every((s) => s.type === 'text')).toBe(true);
  });

  it('leaves email addresses alone', () => {
    const segments = splitMentions('راسل sara@brm.sa اليوم', users);
    expect(segments.every((s) => s.type === 'text')).toBe(true);
  });

  it('still resolves a name written with a non-breaking space', () => {
    const segments = splitMentions('مرحباً @أحمد\u00A0علي', users);
    expect(segments[1]).toEqual({ type: 'mention', value: '@أحمد\u00A0علي', user: ahmad });
  });

  it('resolves a typed regular-space name against the chip NBSP spelling', () => {
    // People often type `@محمد مجدي` instead of picking from the menu — the
    // stored chip uses NBSP between first and last name.
    expect(mentionedIdsIn('@أحمد علي today', users)).toEqual(['u1']);
    expect(mentionedIdsIn(mentionToken(ahmad), users)).toEqual(['u1']);
  });

  it('treats narrow no-break spaces like a normal space in the name', () => {
    const segments = splitMentions('راجع @أحمد\u202Fعلي', users);
    expect(segments[1]).toMatchObject({ type: 'mention', user: ahmad });
  });

  it('keeps two neighbouring Arabic mentions as separate chips', () => {
    const body = `hello ${mentionToken(ahmad)} ${mentionToken(ahmad)}`;
    const mentions = splitMentions(body, users).filter((s) => s.type === 'mention');
    expect(mentions).toHaveLength(2);
    expect(mentions[0].value).toBe('@أحمد\u00A0علي');
  });

  it('strips leftover bidi marks so they cannot show up as ⁦', () => {
    const segments = splitMentions('مرحباً \u2067@أحمد علي\u2069', users);
    expect(segments[1]).toEqual({ type: 'mention', value: '@أحمد علي', user: ahmad });
    expect(segments.every((s) => !/[\u2066-\u2069]/.test(s.value))).toBe(true);
  });

  it('names a person once even if the body names them twice', () => {
    expect(mentionedIdsIn('@أحمد علي ثم @أحمد علي', users)).toEqual(['u1']);
  });

  it('still resolves the legacy @FirstLast spelling', () => {
    const segments = splitMentions('شكراً @SaraKhan', users);
    expect(segments[1]).toEqual({ type: 'mention', value: '@SaraKhan', user: sara });
  });

  it('prefers the longest handle when one name prefixes another', () => {
    const sar: MentionUser = { id: 'u3', firstName: 'Sara', lastName: 'K', email: 's@brm.sa' };
    const segments = splitMentions('@Sara Khan', [sar, sara]);
    expect(segments).toEqual([{ type: 'mention', value: '@Sara Khan', user: sara }]);
  });

  it('handles a mention glued to punctuation and to the next word', () => {
    const segments = splitMentions('(@Sara Khan) و@أحمد علي!', users);
    const mentions = segments.filter((s) => s.type === 'mention');
    expect(mentions).toHaveLength(2);
  });

  it('mixes Arabic, English and two mentions in one body', () => {
    const body = 'hello @Sara Khan — الرجاء مراجعة ticket مع @أحمد علي today';
    expect(mentionedIdsIn(body, users)).toEqual(['u2', 'u1']);
  });
});

describe('findMentionQuery', () => {
  it('reports the word the caret is typing', () => {
    expect(findMentionQuery('مرحباً @sar', 11)).toEqual({ query: 'sar', start: 7 });
  });

  it('keeps the picker open across a space so Arabic full names can be typed', () => {
    expect(findMentionQuery('مرحباً @محمد م', 14)).toEqual({ query: 'محمد م', start: 7 });
  });

  it('closes on a double space or a newline', () => {
    expect(findMentionQuery('مرحباً @محمد  ', 14)).toBeNull();
    expect(findMentionQuery('مرحباً @محمد\n', 13)).toBeNull();
  });

  it('ignores an @ inside an email address', () => {
    expect(findMentionQuery('sara@brm', 8)).toBeNull();
  });
});

describe('applyMention', () => {
  it('replaces the typed fragment and puts the caret after the token', () => {
    const result = applyMention('مرحباً @sar', 7, 11, sara);
    expect(result.content).toBe(`مرحباً ${mentionToken(sara)} `);
    expect(result.content.slice(0, result.caret)).toBe(`مرحباً ${mentionToken(sara)} `);
  });
});

describe('matchesMentionQuery', () => {
  it('matches on name and on email', () => {
    expect(matchesMentionQuery(sara, 'kha')).toBe(true);
    expect(matchesMentionQuery(sara, 'sara@')).toBe(true);
    expect(matchesMentionQuery(sara, 'zzz')).toBe(false);
  });

  it('matches a multi-word Arabic query', () => {
    expect(matchesMentionQuery(ahmad, 'أحمد ع')).toBe(true);
  });
});

describe('mentionToken', () => {
  it('writes the full name with a non-breaking space so the chip cannot wrap', () => {
    expect(mentionToken(ahmad)).toBe('@أحمد\u00A0علي');
  });
});

describe('inferWritingDir', () => {
  it('treats Arabic as right-to-left and English as left-to-right', () => {
    expect(inferWritingDir('الرجاء المراجعة')).toBe('rtl');
    expect(inferWritingDir('please review')).toBe('ltr');
  });

  it('honours a saved RTL mark even when the first words are English', () => {
    expect(inferWritingDir('\u200FTest the commenting @Sara Khan')).toBe('rtl');
    expect(inferWritingDir('\u200Eمرحبا @أحمد علي')).toBe('ltr');
  });

  it('encodes the mark only when the writer picked a side', () => {
    expect(encodeWritingDir('Hello', 'rtl').startsWith('\u200F')).toBe(true);
    expect(encodeWritingDir('Hello', 'auto')).toBe('Hello');
  });
});
