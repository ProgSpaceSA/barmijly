import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

describe('Select', () => {
  it('uses theme surface tokens so the trigger stays readable in dark mode', () => {
    render(
      <Select items={[{ value: 'a', label: 'أ' }]} defaultValue="a">
        <SelectTrigger aria-label="المطور">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );

    const trigger = document.querySelector('[data-slot="select-trigger"]');
    expect(trigger).toBeTruthy();
    expect(trigger?.className).toContain('bg-muted');
    expect(trigger?.className).toContain('text-foreground');
    expect(trigger?.className).not.toContain('bg-white');
  });

  it('highlights the pointed-at option with the accent token', async () => {
    const user = userEvent.setup();
    render(
      <Select items={[{ value: 'a', label: 'أ' }]} defaultValue="a">
        <SelectTrigger aria-label="المطور">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">أ</SelectItem>
        </SelectContent>
      </Select>,
    );

    await user.click(screen.getByRole('combobox', { name: 'المطور' }));
    const option = await screen.findByRole('option', { name: 'أ' });
    expect(option.className).toContain('data-highlighted:bg-accent');
  });
});
