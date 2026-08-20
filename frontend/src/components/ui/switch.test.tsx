import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Switch } from './switch';

describe('Switch', () => {
  it('isolates the thumb motion from the RTL page so the knob stays in the track', () => {
    const { container } = render(
      <div dir="rtl">
        <Switch checked />
      </div>,
    );

    expect(container.querySelector('[data-slot="switch"]')).toHaveAttribute('dir', 'ltr');
  });
});
