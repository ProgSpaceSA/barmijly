import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeveloperMultiPicker } from './DeveloperMultiPicker';
import { ASSIGNEE_LABELS } from '@/lib/constants';

const DEVELOPERS = [
  { id: 'dev-1', firstName: 'ديمة', lastName: 'الحربي' },
  { id: 'dev-2', firstName: 'سارة', lastName: 'القحطاني' },
];

const show = (over: Partial<React.ComponentProps<typeof DeveloperMultiPicker>> = {}) => {
  const onToggle = vi.fn();
  const onSetLead = vi.fn();
  render(
    <DeveloperMultiPicker
      developers={DEVELOPERS}
      selected={['dev-1']}
      leadId="dev-1"
      onToggle={onToggle}
      onSetLead={onSetLead}
      {...over}
    />,
  );
  return { onToggle, onSetLead };
};

describe('DeveloperMultiPicker', () => {
  it('marks who is already picked', () => {
    show();

    expect(screen.getByRole('button', { name: 'ديمة الحربي' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'سارة القحطاني' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds a second developer rather than replacing the first', async () => {
    // The whole point of the change: assignment is a set, not one choice.
    const user = userEvent.setup();
    const { onToggle } = show();

    await user.click(screen.getByRole('button', { name: 'سارة القحطاني' }));

    expect(onToggle).toHaveBeenCalledWith('dev-2');
  });

  it('offers the lead crown only on developers who are on the ticket', () => {
    show();

    expect(screen.getByRole('button', { name: `${ASSIGNEE_LABELS.makeLead}: ديمة الحربي` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `${ASSIGNEE_LABELS.makeLead}: سارة القحطاني` })).not.toBeInTheDocument();
  });

  it('hands the lead over within the same list', async () => {
    const user = userEvent.setup();
    const { onSetLead } = show({ selected: ['dev-1', 'dev-2'] });

    await user.click(screen.getByRole('button', { name: `${ASSIGNEE_LABELS.makeLead}: سارة القحطاني` }));

    expect(onSetLead).toHaveBeenCalledWith('dev-2');
  });

  it('says who leads', () => {
    show({ selected: ['dev-1', 'dev-2'], leadId: 'dev-2' });

    expect(screen.getByText(`${ASSIGNEE_LABELS.lead}: سارة القحطاني`)).toBeInTheDocument();
  });

  it('shows nothing to pick when there are no developers in reach', () => {
    show({ developers: [], selected: [], leadId: '' });

    expect(screen.getByText(ASSIGNEE_LABELS.empty)).toBeInTheDocument();
  });
});
