import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MarkdownEditor, findSlashQuery } from './MarkdownEditor';

/** The editor is controlled; every test drives it through a real state owner. */
function Harness({ initial = '', onValue }: { initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <MarkdownEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      ariaLabel="الوصف"
      placeholder="اكتب…"
    />
  );
}

const editor = () => screen.getByLabelText('الوصف') as HTMLTextAreaElement;

function select(el: HTMLTextAreaElement, start: number, end: number) {
  el.setSelectionRange(start, end);
  fireEvent.select(el);
}

describe('findSlashQuery', () => {
  it('fires on a slash at the start of the line', () => {
    expect(findSlashQuery('/tab', 4)).toEqual({ query: 'tab', start: 0 });
  });

  it('ignores a slash inside a url', () => {
    expect(findSlashQuery('https://a.b/c', 13)).toBeNull();
  });

  it('ignores a slash after text on the line', () => {
    expect(findSlashQuery('نص /', 4)).toBeNull();
  });

  it('finds a slash on a later line', () => {
    expect(findSlashQuery('نص\n/جد', 6)).toEqual({ query: 'جد', start: 3 });
  });
});

describe('MarkdownEditor', () => {
  it('paints the source with syntax tokens behind the textarea', () => {
    const { container } = render(<Harness initial={'# عنوان\n- عنصر'} />);

    const mirror = container.querySelector('.brm-mdedit-mirror')!;
    expect(mirror).toHaveAttribute('aria-hidden', 'true');
    expect(mirror.textContent).toBe('# عنوان\n- عنصر');
    expect(container.querySelector('.brm-md-tok-heading')).toHaveTextContent('عنوان');
  });

  it('wraps the selection when the bold button is pressed', () => {
    render(<Harness initial="نص مهم" />);
    select(editor(), 3, 6);

    fireEvent.click(screen.getByRole('button', { name: 'عريض' }));

    expect(editor()).toHaveValue('نص **مهم**');
  });

  it('bolds on Ctrl+B too', () => {
    render(<Harness initial="نص مهم" />);
    const el = editor();
    select(el, 3, 6);

    fireEvent.keyDown(el, { key: 'b', ctrlKey: true });

    expect(el).toHaveValue('نص **مهم**');
  });

  it('honours Ctrl+B on an Arabic layout, where e.key is not "b"', () => {
    render(<Harness initial="نص مهم" />);
    const el = editor();
    select(el, 3, 6);

    fireEvent.keyDown(el, { key: 'ب', code: 'KeyB', ctrlKey: true });

    expect(el).toHaveValue('نص **مهم**');
  });

  it('turns the current line into a bullet', () => {
    render(<Harness initial="عنصر" />);
    select(editor(), 0, 0);

    fireEvent.click(screen.getByRole('button', { name: 'قائمة نقطية' }));

    expect(editor()).toHaveValue('- عنصر');
  });

  it('makes a bullet list on Ctrl+Shift+8', () => {
    render(<Harness initial="عنصر" />);
    const el = editor();
    select(el, 0, 0);

    fireEvent.keyDown(el, { key: '*', code: 'Digit8', ctrlKey: true, shiftKey: true });

    expect(el).toHaveValue('- عنصر');
  });

  it('carries the list marker onto the next line', () => {
    render(<Harness initial="- أول" />);
    const el = editor();
    select(el, 5, 5);

    fireEvent.keyDown(el, { key: 'Enter' });

    expect(el).toHaveValue('- أول\n- ');
  });

  it('lets Shift+Enter break the line without a marker', () => {
    render(<Harness initial="- أول" />);
    const el = editor();
    select(el, 5, 5);

    fireEvent.keyDown(el, { key: 'Enter', shiftKey: true });

    expect(el).toHaveValue('- أول');
  });

  it('indents a list item with Tab', () => {
    render(<Harness initial="- أول" />);
    const el = editor();
    select(el, 5, 5);

    fireEvent.keyDown(el, { key: 'Tab' });

    expect(el).toHaveValue('  - أول');
  });

  it('outdents it again with Shift+Tab', () => {
    render(<Harness initial="  - أول" />);
    const el = editor();
    select(el, 7, 7);

    fireEvent.keyDown(el, { key: 'Tab', shiftKey: true });

    expect(el).toHaveValue('- أول');
  });

  it('lets Tab leave the field in ordinary prose, so it is not a keyboard trap', () => {
    render(<Harness initial="نص" />);
    const el = editor();
    select(el, 2, 2);

    // fireEvent returns false only when the handler called preventDefault.
    expect(fireEvent.keyDown(el, { key: 'Tab' })).toBe(true);
    expect(el).toHaveValue('نص');
  });

  it('links a url pasted over a selection', () => {
    render(<Harness initial="افتح الرابط" />);
    const el = editor();
    select(el, 5, 11);

    fireEvent.paste(el, { clipboardData: { getData: () => 'https://brm.sa' } });

    expect(el).toHaveValue('افتح [الرابط](https://brm.sa)');
  });

  it('opens the slash menu and inserts the block it picks', () => {
    render(<Harness />);
    const el = editor();

    fireEvent.change(el, { target: { value: '/' } });
    el.setSelectionRange(1, 1);
    fireEvent.select(el);

    const menu = screen.getByRole('listbox');
    // Every block command is listed — the menu scrolls rather than truncating.
    expect(within(menu).getAllByRole('option').length).toBeGreaterThan(8);

    fireEvent.mouseDown(within(menu).getByRole('option', { name: /فاصل/ }));

    expect(editor()).toHaveValue('---');
  });

  it('filters the slash menu, in Arabic or in English', () => {
    render(<Harness />);
    const el = editor();

    fireEvent.change(el, { target: { value: '/table' } });
    el.setSelectionRange(6, 6);
    fireEvent.select(el);

    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName(/جدول/);
  });

  it('closes the slash menu on Escape without touching the text', () => {
    render(<Harness />);
    const el = editor();

    fireEvent.change(el, { target: { value: '/' } });
    el.setSelectionRange(1, 1);
    fireEvent.select(el);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(el, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(el).toHaveValue('/');
  });

  it('renders the document in preview and hides the editor', () => {
    render(<Harness initial={'# عنوان'} />);

    fireEvent.click(screen.getByRole('button', { name: 'معاينة' }));

    expect(screen.getByRole('heading', { level: 1, name: 'عنوان' })).toBeInTheDocument();
    expect(screen.queryByLabelText('الوصف')).toBeNull();
  });

  it('disables the formatting buttons while previewing', () => {
    render(<Harness initial="نص" />);

    fireEvent.click(screen.getByRole('button', { name: 'معاينة' }));

    expect(screen.getByRole('button', { name: 'عريض' })).toBeDisabled();
  });

  it('counts words and characters', () => {
    render(<Harness initial="كلمة أخرى" />);
    expect(screen.getByText(/2 كلمة · 9 حرف/)).toBeInTheDocument();
  });

  it('shows the syntax cheatsheet on demand', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'دليل التنسيق' }));

    expect(screen.getByText('- [ ] مهمة')).toBeInTheDocument();
  });

  it('reports every keystroke to the form', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    fireEvent.change(editor(), { target: { value: 'وصف' } });

    expect(onValue).toHaveBeenCalledWith('وصف');
  });
});
