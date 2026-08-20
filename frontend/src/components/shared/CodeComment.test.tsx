import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodeComment } from './CodeComment';

describe('CodeComment', () => {
  it('isolates the slashes as LTR and leaves Arabic to its own direction', () => {
    const { container } = render(<CodeComment>لم يتم العثور على تذاكر مؤرشفة</CodeComment>);

    const isolate = container.firstElementChild;
    expect(isolate).toHaveClass('ltr-isolate');
    expect(isolate).toHaveClass('inline-block');
    expect(isolate).not.toHaveAttribute('dir');
    expect(screen.getByText(/\/\//)).toBeInTheDocument();
    expect(screen.getByText('لم يتم العثور على تذاكر مؤرشفة')).toHaveAttribute('dir', 'auto');
  });

  it('does the same for an English label', () => {
    render(<CodeComment>ticket management system</CodeComment>);
    expect(screen.getByText('ticket management system')).toHaveAttribute('dir', 'auto');
  });
});
