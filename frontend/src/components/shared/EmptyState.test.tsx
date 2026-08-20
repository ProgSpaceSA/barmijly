import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('keeps the $ prompt on the left of an English command', () => {
    const { container } = render(
      <EmptyState
        title="لا توجد إشعارات"
        command="list notifications"
        description="ستظهر هنا التحديثات على التذاكر والمهام"
      />,
    );

    const prompt = container.querySelector('.ltr-isolate');
    expect(prompt).toHaveClass('inline-flex');
    expect(prompt).not.toHaveAttribute('dir');
    expect(prompt?.textContent?.replace(/\s+/g, ' ').trim()).toMatch(/^\$list notifications/);
    expect(screen.getByText('ستظهر هنا التحديثات على التذاكر والمهام')).toHaveAttribute('dir', 'auto');
  });
});
