import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentComposer, scrollChildIntoView, type CommentSubmit } from './CommentComposer';
import { mentionToken, type MentionUser } from '@/lib/mentions';
import { COMMENT_LABELS } from '@/lib/constants';

const ahmad: MentionUser = {
  id: 'u1', firstName: 'أحمد', lastName: 'علي', email: 'ahmad@brm.sa', role: 'DEVELOPER',
};
const sara: MentionUser = {
  id: 'u2', firstName: 'Sara', lastName: 'Khan', email: 'sara@brm.sa', role: 'QA',
};
const users = [ahmad, sara];

const noop = async () => {};

/** `location` is the only thing that tells the left Shift from the right one. */
function shiftKeyDown(el: HTMLElement, location: 1 | 2) {
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Shift', location, ctrlKey: true, bubbles: true }),
    );
  });
}

function setup(onSubmit: (p: CommentSubmit) => Promise<void> = noop) {
  const view = render(
    <CommentComposer users={users} currentUserId="me" onSubmit={onSubmit} />,
  );
  const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
  return { ...view, textarea };
}

describe('CommentComposer — writing direction', () => {
  it('starts in auto so the first letter typed decides the direction', () => {
    const { textarea } = setup();
    expect(textarea).toHaveAttribute('dir', 'auto');
  });

  it('Ctrl + Right Shift switches to right-to-left', async () => {
    const user = userEvent.setup();
    const { textarea } = setup();
    await user.click(textarea);

    // `location: 2` is the right-hand Shift, the Windows binding for RTL.
    await user.keyboard('{Control>}');
    shiftKeyDown(textarea, 2);

    await waitFor(() => expect(textarea).toHaveAttribute('dir', 'rtl'));
  });

  it('Ctrl + Left Shift switches to left-to-right', async () => {
    const user = userEvent.setup();
    const { textarea } = setup();
    await user.click(textarea);

    shiftKeyDown(textarea, 1);

    await waitFor(() => expect(textarea).toHaveAttribute('dir', 'ltr'));
  });

  it('keeps the pick while this composer is open', async () => {
    const user = userEvent.setup();
    const { textarea } = setup();
    await user.click(textarea);
    shiftKeyDown(textarea, 1);
    await waitFor(() => expect(textarea).toHaveAttribute('dir', 'ltr'));

    await user.type(textarea, 'hello');
    expect(textarea).toHaveAttribute('dir', 'ltr');
  });

  it('gives a fresh empty composer back to auto — an old pick is not this comment', async () => {
    const user = userEvent.setup();
    const { textarea, unmount } = setup();
    await user.click(textarea);
    shiftKeyDown(textarea, 1);
    await waitFor(() => expect(textarea).toHaveAttribute('dir', 'ltr'));
    unmount();

    const { textarea: next } = setup();
    expect(next).toHaveAttribute('dir', 'auto');
    expect(window.localStorage.getItem('brm-editor-dir')).toBeNull();
  });

  it('opens an edit box in the comment direction, not auto', () => {
    render(
      <CommentComposer
        users={users}
        currentUserId="me"
        initialContent="الرجاء المراجعة"
        initialDirection="rtl"
        onSubmit={noop}
      />,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('dir', 'rtl');
  });

  it('saves an RTL mark so mixed English-first text stays right-to-left', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <CommentComposer
        users={users}
        currentUserId="me"
        initialDirection="rtl"
        onSubmit={onSubmit}
      />,
    );
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello @Sara Khan');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].content.startsWith('\u200F')).toBe(true);
  });
});

describe('CommentComposer — mentions', () => {
  it('paints a resolved mention and leaves the rest of the line alone', async () => {
    const user = userEvent.setup();
    const { textarea, container } = setup();

    await user.type(textarea, 'مرحباً @Sara Khan راجعي');

    const painted = container.querySelectorAll('.brm-mention');
    expect(painted).toHaveLength(1);
    expect(painted[0]).toHaveTextContent('@Sara Khan');
  });

  it('drops the highlight the moment the name stops matching', async () => {
    const user = userEvent.setup();
    const { textarea, container } = setup();

    await user.type(textarea, 'مرحباً @Sara Khan');
    expect(container.querySelectorAll('.brm-mention')).toHaveLength(1);

    // Backspacing into the surname breaks the handle — plain text again.
    await user.type(textarea, '{Backspace}{Backspace}');
    expect(container.querySelectorAll('.brm-mention')).toHaveLength(0);
  });

  it('sends the ids the body still spells out, with no chips to maintain', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { textarea } = setup(onSubmit);

    await user.type(textarea, 'hello @Sara Khan و@أحمد علي');
    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].mentions).toEqual(['u2', 'u1']);
  });

  it('offers a picker filtered by what is typed after the @', async () => {
    const user = userEvent.setup();
    const { textarea } = setup();

    await user.type(textarea, '@sar');

    expect(await screen.findByRole('option', { name: /Sara Khan/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /أحمد/ })).not.toBeInTheDocument();
  });

  it('inserts the picked person and closes the picker', async () => {
    const user = userEvent.setup();
    const { textarea } = setup();

    await user.type(textarea, 'مرحباً @sar');
    await user.click(await screen.findByRole('option', { name: /Sara Khan/ }));

    await waitFor(() => expect(textarea.value).toBe(`مرحباً ${mentionToken(sara)} `));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keeps typing normally after a mention without reopening the picker', async () => {
    const user = userEvent.setup();
    const { textarea } = setup();

    await user.type(textarea, '@sar');
    await user.click(await screen.findByRole('option', { name: /Sara Khan/ }));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());

    await user.type(textarea, ' follow up');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(textarea.value).toBe(`${mentionToken(sara)}  follow up`);
  });

  it('closes an empty picker when the writer types a space after a dead-end query', async () => {
    const user = userEvent.setup();
    const { textarea } = setup();

    await user.type(textarea, '@zzz ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(textarea.value).toBe('@zzz ');
  });

  it('stays responsive after picking a latin developer name', async () => {
    const dev: MentionUser = {
      id: 'u3',
      firstName: 'ahmed',
      lastName: 'mohamed',
      email: 'ahmed@brm.sa',
      role: 'DEVELOPER',
    };
    const user = userEvent.setup();
    render(
      <CommentComposer users={[dev, ...users]} currentUserId="me" onSubmit={noop} />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    await user.type(textarea, '@ahmed');
    await user.click(await screen.findByRole('option', { name: /ahmed mohamed/i }));

    await waitFor(() =>
      expect(textarea.value).toBe(`${mentionToken(dev)} `),
    );
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.type(textarea, 'please review');
    expect(textarea.value).toBe(`${mentionToken(dev)} please review`);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('paints the mirror without isolating, so the caret and the colour agree', async () => {
    const user = userEvent.setup();
    const { textarea, container } = setup();

    // `auto` plus a mention was the broken case: `<bdi>`/`dir` switch on
    // `unicode-bidi: isolate`, which a textarea never applies.
    await user.type(textarea, 'ffff @Sara Khan');

    const painted = container.querySelector('.brm-editor-mirror .brm-mention')!;
    expect(painted.tagName).toBe('SPAN');
    expect(painted.hasAttribute('dir')).toBe(false);
  });

  it('the @ button opens the picker and leaves it open', async () => {
    const user = userEvent.setup();
    const { textarea } = setup();

    await user.type(textarea, 'مرحبا');
    await user.click(screen.getByRole('button', { name: new RegExp(COMMENT_LABELS.mention) }));

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    // Blur used to close it 150ms later — the button shut its own menu.
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('moves the highlight with the arrows', async () => {
    const user = userEvent.setup();
    const { textarea } = setup();

    await user.type(textarea, '@');
    const first = await screen.findByRole('option', { name: /أحمد/ });
    const second = screen.getByRole('option', { name: /Sara Khan/ });
    expect(first).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveAttribute('aria-selected', 'false');
  });
});

describe('scrollChildIntoView', () => {
  const rect = (top: number, bottom: number): DOMRect =>
    ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => {} });

  it('scrolls down when the row sits below the visible slice', () => {
    const parent = document.createElement('div');
    const child = document.createElement('button');
    parent.appendChild(child);
    parent.scrollTop = 0;
    vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue(rect(0, 100));
    vi.spyOn(child, 'getBoundingClientRect').mockReturnValue(rect(120, 160));

    scrollChildIntoView(parent, child);
    expect(parent.scrollTop).toBe(60);
  });

  it('scrolls up when the row sits above the visible slice', () => {
    const parent = document.createElement('div');
    const child = document.createElement('button');
    parent.appendChild(child);
    parent.scrollTop = 80;
    vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue(rect(0, 100));
    vi.spyOn(child, 'getBoundingClientRect').mockReturnValue(rect(-40, 0));

    scrollChildIntoView(parent, child);
    expect(parent.scrollTop).toBe(40);
  });
});

describe('CommentComposer — sending', () => {
  it('will not send an empty comment', () => {
    setup();
    expect(screen.getByRole('button', { name: /إرسال/ })).toBeDisabled();
  });

  it('stays busy until the caller finishes, uploads included', async () => {
    let release: () => void = () => {};
    const onSubmit = vi.fn(
      (p: CommentSubmit) =>
        new Promise<void>((resolve) => {
          p.setStatus('جارٍ رفع المرفقات');
          release = resolve;
        }),
    );
    const user = userEvent.setup();
    const { textarea } = setup(onSubmit);

    await user.type(textarea, 'مع مرفق');
    await user.keyboard('{Control>}{Enter}{/Control}');

    // Disabling the box would dump the caret; read-only keeps it so the next
    // comment is ready to type, and a click outside can still move focus away.
    await waitFor(() => expect(textarea).toHaveProperty('readOnly', true));
    expect(screen.getByRole('button', { name: /إرسال/ })).toBeDisabled();
    expect(screen.queryByText('جارٍ رفع المرفقات')).not.toBeInTheDocument();
    expect(screen.queryByText(COMMENT_LABELS.posting)).not.toBeInTheDocument();
    expect(textarea).toHaveFocus();

    release();
    await waitFor(() => expect(textarea.value).toBe(''));
    expect(textarea).toHaveFocus();
    expect(textarea).toHaveProperty('readOnly', false);
  });

  it('keeps the caret after sending from the button', async () => {
    const user = userEvent.setup();
    const { textarea } = setup(async () => {});

    await user.type(textarea, 'hello');
    await user.click(screen.getByRole('button', { name: /إرسال/ }));

    await waitFor(() => expect(textarea.value).toBe(''));
    expect(textarea).toHaveFocus();
  });

  it('moves focus away when the click lands outside the field', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <CommentComposer users={users} currentUserId="me" onSubmit={noop} />
        <button type="button">خارج</button>
      </div>,
    );
    const textarea = screen.getByRole('textbox');

    await user.click(textarea);
    expect(textarea).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'خارج' }));
    expect(textarea).not.toHaveFocus();
  });

  it('keeps the draft when the send fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    const { textarea } = setup(onSubmit);

    await user.type(textarea, 'نص مهم');
    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(textarea.value).toBe('نص مهم');
    expect(textarea).not.toBeDisabled();
  });
});
