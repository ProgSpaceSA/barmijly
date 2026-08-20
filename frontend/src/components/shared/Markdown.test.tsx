import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders nothing for an empty description', () => {
    const { container } = render(<Markdown content="   " />);
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to the empty slot when there is no content', () => {
    render(<Markdown content={null} empty={<p>لا يوجد وصف</p>} />);
    expect(screen.getByText('لا يوجد وصف')).toBeInTheDocument();
  });

  it('renders headings, emphasis, and lists', () => {
    render(<Markdown content={'# عنوان\n\nنص **عريض**\n\n- أول\n- ثانٍ'} />);

    expect(screen.getByRole('heading', { level: 1, name: 'عنوان' })).toBeInTheDocument();
    expect(screen.getByText('عريض').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('gives every block its own direction so pasted English keeps its own', () => {
    render(<Markdown content={'نص عربي\n\nEnglish line'} />);
    const paragraphs = screen.getByText('نص عربي');
    expect(paragraphs).toHaveAttribute('dir', 'auto');
  });

  it('renders GFM tables inside their own scroller', () => {
    const { container } = render(<Markdown content={'| أ | ب |\n| --- | --- |\n| 1 | 2 |'} />);

    expect(container.querySelector('.brm-md-table-scroll > table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'أ' })).toBeInTheDocument();
  });

  it('renders task lists read-only — the description is edited as text', () => {
    const { container } = render(<Markdown content={'- [x] تم\n- [ ] باقٍ'} />);

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(boxes[0]).toBeDisabled();
    expect(boxes[1]).not.toBeChecked();

    const items = container.querySelectorAll('.brm-md-task-item');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.brm-md-task-body')).toHaveTextContent('تم');
    expect(items[1].querySelector('.brm-md-task-body')).toHaveTextContent('باقٍ');
  });

  it('opens external links in a new tab, safely', () => {
    render(<Markdown content="[برمجلي](https://brm.sa)" />);

    const link = screen.getByRole('link', { name: /برمجلي/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps in-app links in the same tab', () => {
    render(<Markdown content="[تذكرة](/tickets/1)" />);
    expect(screen.getByRole('link', { name: 'تذكرة' })).not.toHaveAttribute('target');
  });

  it('never executes html written into a description', () => {
    const { container } = render(
      <Markdown content={'<img src=x onerror="alert(1)">\n\n<script>alert(2)</script>'} />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('strips a javascript: url off a link', () => {
    const { container } = render(<Markdown content="[اضغط](javascript:alert(1))" />);
    expect(container.querySelector('a')).toHaveAttribute('href', '');
  });

  it('does not leak the parser node onto the dom', () => {
    const { container } = render(<Markdown content="نص [رابط](https://brm.sa)" />);
    expect(container.querySelector('[node]')).toBeNull();
  });

  it('resolves root-relative uploads against the api host', () => {
    render(<Markdown content="![لقطة](/uploads/a.png)" baseUrl="http://api.test" />);
    expect(screen.getByAltText('لقطة')).toHaveAttribute('src', 'http://api.test/uploads/a.png');
  });

  it('hands an image click to the page lightbox instead of navigating', () => {
    const onImageClick = vi.fn();
    render(<Markdown content="![لقطة](/a.png)" onImageClick={onImageClick} />);

    fireEvent.click(screen.getByAltText('لقطة'));
    expect(onImageClick).toHaveBeenCalledWith('/a.png', 'لقطة');
  });

  it('labels a code fence with its language and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    const { container } = render(<Markdown content={'```sql\nSELECT 1;\n```'} />);

    expect(screen.getByText('sql')).toBeInTheDocument();
    // Code stays left-to-right no matter which way the page runs.
    expect(container.querySelector('.brm-md-fence')).toHaveAttribute('dir', 'ltr');

    fireEvent.click(screen.getByTitle('نسخ الكود'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('SELECT 1;\n'));
  });

  it('highlights a fenced language with hljs classes', () => {
    const { container } = render(<Markdown content={'```sql\nSELECT 1;\n```'} />);
    expect(container.querySelector('.hljs-keyword')).toBeTruthy();
  });

  it('treats a single newline as a line break, the way people type', () => {
    const { container } = render(<Markdown content={'سطر أول\nسطر ثانٍ'} />);
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });
});
