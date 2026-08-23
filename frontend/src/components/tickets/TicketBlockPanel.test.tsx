import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PauseReasonField, TicketBlockBanner, TicketBlockPanel } from './TicketBlockPanel';
import { BLOCK_LABELS } from '@/lib/constants';

const panel = (props: Partial<React.ComponentProps<typeof TicketBlockPanel>> = {}) => {
  const onRequest = vi.fn();
  const view = render(
    <TicketBlockPanel
      status="IN_PROGRESS"
      canBlock
      canHold
      canResume
      onRequest={onRequest}
      {...props}
    />,
  );
  return { onRequest, ...view };
};

describe('TicketBlockPanel', () => {
  it('offers both stop kinds while work is under way', () => {
    panel();

    expect(screen.getByRole('button', { name: BLOCK_LABELS.block })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BLOCK_LABELS.hold })).toBeInTheDocument();
  });

  it.each(['DRAFT', 'NEW', 'COMPLETED', 'CLOSED'])(
    'does not offer to stop a ticket in %s',
    (status) => {
      panel({ status });

      expect(screen.queryByRole('button', { name: BLOCK_LABELS.block })).not.toBeInTheDocument();
    },
  );

  it('hides the deliberate pause from someone who may only raise a blocker', () => {
    // A developer reports that work is stuck; shelving the ticket is leadership's call.
    panel({ canHold: false });

    expect(screen.getByRole('button', { name: BLOCK_LABELS.block })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BLOCK_LABELS.hold })).not.toBeInTheDocument();
  });

  it('hides stop controls from a contributor who cannot resume', () => {
    panel({ canBlock: false, canHold: false });

    expect(screen.queryByRole('button', { name: BLOCK_LABELS.block })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BLOCK_LABELS.hold })).not.toBeInTheDocument();
  });

  it('asks before stopping rather than firing straight away', async () => {
    const user = userEvent.setup();
    const { onRequest } = panel();

    await user.click(screen.getByRole('button', { name: BLOCK_LABELS.block }));

    expect(onRequest).toHaveBeenCalledWith('block');
  });

  it('keeps the reason out of the sidebar', () => {
    // An always-open textarea reads as a field waiting to be filled in on every
    // visit; it belongs in the confirmation instead.
    panel();

    expect(screen.queryByLabelText(BLOCK_LABELS.reason)).not.toBeInTheDocument();
  });

  it.each(['BLOCKED', 'ON_HOLD'])('offers only resume once the ticket is %s', (status) => {
    panel({ status });

    expect(screen.getByRole('button', { name: BLOCK_LABELS.resume })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BLOCK_LABELS.block })).not.toBeInTheDocument();
  });

  it('shows nothing to a role that cannot resume a stopped ticket', () => {
    const { container } = panel({ status: 'ON_HOLD', canBlock: false, canHold: false, canResume: false });

    expect(container).toBeEmptyDOMElement();
  });
});

describe('PauseReasonField', () => {
  it('reports what the user types', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PauseReasonField value="" onChange={onChange} />);

    await user.type(screen.getByLabelText(BLOCK_LABELS.reason), 'x');

    expect(onChange).toHaveBeenCalledWith('x');
  });
});

describe('TicketBlockBanner', () => {
  it('explains why a blocked ticket stopped', () => {
    render(<TicketBlockBanner status="BLOCKED" pauseReason="بانتظار بيانات المورّد" />);

    expect(screen.getByRole('status')).toHaveTextContent(BLOCK_LABELS.blockedBanner);
    expect(screen.getByRole('status')).toHaveTextContent('بانتظار بيانات المورّد');
  });

  it('links to the ticket that caused the stop', () => {
    render(
      <TicketBlockBanner
        status="BLOCKED"
        pauseReason="ينتظر الربط"
        blockedByTicket={{ id: 'ticket-9', ticketNumber: 120, title: 'ربط البوابة' }}
      />,
    );

    expect(screen.getByRole('link', { name: /120/ })).toHaveAttribute('href', '/tickets/ticket-9');
  });

  it('distinguishes a deliberate hold from a blocker', () => {
    render(<TicketBlockBanner status="ON_HOLD" pauseReason="مؤجلة للربع القادم" />);

    expect(screen.getByRole('status')).toHaveTextContent(BLOCK_LABELS.heldBanner);
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'neutral');
  });

  it('stays out of the way while the ticket is running', () => {
    const { container } = render(<TicketBlockBanner status="IN_PROGRESS" />);

    expect(container).toBeEmptyDOMElement();
  });
});
