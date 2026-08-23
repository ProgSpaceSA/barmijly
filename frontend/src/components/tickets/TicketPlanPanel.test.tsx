import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TicketPlanPanel } from './TicketPlanPanel';
import { ASSIGNEE_LABELS, DIFFICULTY_LABELS, ESTIMATE_LABELS } from '@/lib/constants';
import { toast } from 'sonner';

const mockPatch = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    patch: (...a: unknown[]) => mockPatch(...a),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PLAN = {
  scheduledStart: '2026-08-01T00:00:00.000Z',
  estimatedDeadline: '2026-08-20T00:00:00.000Z',
  estimatedHours: 50,
  difficultyLevel: 3,
};

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function show(canEdit = true) {
  return render(
    <TicketPlanPanel ticketId="ticket-1" canEdit={canEdit} plan={PLAN} />,
    { wrapper },
  );
}

async function flushDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockPatch.mockResolvedValue({ data: { id: 'ticket-1', ...PLAN } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TicketPlanPanel', () => {
  it('renders plan fields when editing is allowed', () => {
    show();
    expect(screen.getByText(ASSIGNEE_LABELS.planSection)).toBeInTheDocument();
    expect(screen.getByLabelText('تاريخ البدء')).toHaveValue('2026-08-01');
    expect(screen.getByLabelText('تاريخ التسليم المتوقع')).toHaveValue('2026-08-20');
    expect(screen.getByLabelText(ESTIMATE_LABELS.hours)).toHaveValue(50);
    expect(screen.getByRole('combobox', { name: ESTIMATE_LABELS.difficulty })).toHaveTextContent(DIFFICULTY_LABELS[3]);
  });

  it('does not render when editing is disabled', () => {
    show(false);
    expect(screen.queryByText(ASSIGNEE_LABELS.planSection)).not.toBeInTheDocument();
  });

  it('shows only estimate fields in estimate-only mode', () => {
    render(
      <TicketPlanPanel ticketId="ticket-1" canEdit estimateOnly plan={PLAN} />,
      { wrapper },
    );
    expect(screen.getByText(ASSIGNEE_LABELS.estimateSection)).toBeInTheDocument();
    expect(screen.queryByLabelText('تاريخ البدء')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('تاريخ التسليم المتوقع')).not.toBeInTheDocument();
    expect(screen.getByLabelText(ESTIMATE_LABELS.hours)).toHaveValue(50);
    expect(screen.getByRole('combobox', { name: ESTIMATE_LABELS.difficulty })).toHaveTextContent(DIFFICULTY_LABELS[3]);
  });

  it('saves only estimate fields when estimate-only', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <TicketPlanPanel ticketId="ticket-1" canEdit estimateOnly plan={PLAN} />,
      { wrapper },
    );

    await user.clear(screen.getByLabelText(ESTIMATE_LABELS.hours));
    await user.type(screen.getByLabelText(ESTIMATE_LABELS.hours), '72');
    await flushDebounce();

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/tickets/ticket-1/plan', { estimatedHours: 72 }),
    );
  });

  it('debounces difficulty saves into one request', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole('combobox', { name: ESTIMATE_LABELS.difficulty }));
    await user.click(await screen.findByRole('option', { name: DIFFICULTY_LABELS[4] }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/tickets/ticket-1/plan', {
        difficultyLevel: 4,
      }),
    );
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'حفظ' })).not.toBeInTheDocument();
  });

  it('debounces a date change into one request', async () => {
    show();

    fireEvent.change(screen.getByLabelText('تاريخ البدء'), { target: { value: '2026-09-01' } });
    await flushDebounce();

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
  });

  it('debounces estimated hours while typing', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    show();

    const hours = screen.getByLabelText(ESTIMATE_LABELS.hours);
    await user.clear(hours);
    await user.type(hours, '72');
    expect(mockPatch).not.toHaveBeenCalled();

    await flushDebounce();

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/tickets/ticket-1/plan', expect.objectContaining({ estimatedHours: 72 })),
    );
    expect(mockPatch.mock.calls[0][1]).not.toHaveProperty('difficultyLevel');
  });

  it('keeps the typed hours when the parent plan prop is still stale after save', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockPatch.mockResolvedValue({ data: { id: 'ticket-1', ...PLAN, estimatedHours: 605 } });

    const { rerender } = render(
      <TicketPlanPanel ticketId="ticket-1" canEdit plan={PLAN} />,
      { wrapper },
    );

    const hours = screen.getByLabelText(ESTIMATE_LABELS.hours);
    await user.clear(hours);
    await user.type(hours, '605');
    await flushDebounce();

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(ASSIGNEE_LABELS.planSaved)).toBeInTheDocument());

    rerender(<TicketPlanPanel ticketId="ticket-1" canEdit plan={PLAN} />);
    expect(screen.getByLabelText(ESTIMATE_LABELS.hours)).toHaveValue(605);

    rerender(
      <TicketPlanPanel ticketId="ticket-1" canEdit plan={{ ...PLAN, estimatedHours: 605 }} />,
    );
    expect(screen.getByLabelText(ESTIMATE_LABELS.hours)).toHaveValue(605);
  });

  it('shows an inline saved hint instead of a toast', async () => {
    show();

    fireEvent.change(screen.getByLabelText('تاريخ البدء'), { target: { value: '2026-09-01' } });
    await flushDebounce();

    await waitFor(() => expect(screen.getByText(ASSIGNEE_LABELS.planSaved)).toBeInTheDocument());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not revert estimated hours while save is in flight', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let resolveSave: (value: unknown) => void = () => {};
    mockPatch.mockImplementation(
      () => new Promise((resolve) => { resolveSave = resolve; }),
    );

    const { rerender } = render(
      <TicketPlanPanel ticketId="ticket-1" canEdit plan={PLAN} />,
      { wrapper },
    );

    const hours = screen.getByLabelText(ESTIMATE_LABELS.hours);
    await user.clear(hours);
    await user.type(hours, '10');
    await flushDebounce();

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));

    rerender(<TicketPlanPanel ticketId="ticket-1" canEdit plan={PLAN} />);
    expect(screen.getByLabelText(ESTIMATE_LABELS.hours)).toHaveValue(10);

    resolveSave({ data: { id: 'ticket-1', ...PLAN, estimatedHours: 10 } });
    await waitFor(() =>
      expect(screen.getByLabelText(ESTIMATE_LABELS.hours)).toHaveValue(10),
    );
  });
});
