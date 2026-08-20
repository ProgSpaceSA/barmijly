import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TicketCodeBadge } from './TicketCodeBadge';

const writeText = vi.fn().mockResolvedValue(undefined);
const toast = { success: vi.fn(), error: vi.fn() };

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toast.success(...args),
    error: (...args: unknown[]) => toast.error(...args),
  },
}));

describe('TicketCodeBadge', () => {
  beforeEach(() => {
    writeText.mockClear();
    toast.success.mockClear();
    toast.error.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('renders nothing without a ticket number', () => {
    const { container } = render(<TicketCodeBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pads the code like the rest of the app', () => {
    render(<TicketCodeBadge ticketNumber={18} />);
    expect(screen.getByRole('button', { name: /BRM-0018/ })).toHaveAttribute('dir', 'ltr');
  });

  it('copies the ticket code on click', async () => {
    render(<TicketCodeBadge ticketNumber={31} />);

    fireEvent.click(screen.getByRole('button', { name: /BRM-0031/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('BRM-0031'));
    expect(toast.success).toHaveBeenCalledWith('تم نسخ رقم التذكرة');
  });

  it('does not follow a parent ticket link', async () => {
    const parentClick = vi.fn();
    render(
      <a href="/tickets/x" onClick={parentClick}>
        <TicketCodeBadge ticketNumber={31} />
      </a>,
    );

    fireEvent.click(screen.getByRole('button', { name: /BRM-0031/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('BRM-0031'));
    expect(parentClick).not.toHaveBeenCalled();
  });
});
