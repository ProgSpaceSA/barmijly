import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TicketDependencies } from './TicketDependencies';
import { DEPENDENCY_LABELS } from '@/lib/constants';
import { toast } from 'sonner';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    delete: (...a: unknown[]) => mockDelete(...a),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const prerequisite = { id: 'ticket-9', ticketNumber: 120, title: 'ربط البوابة', status: 'IN_PROGRESS' };
const BLOCKS = 'BLOCKS';
const dependent = { id: 'ticket-7', ticketNumber: 131, title: 'تقرير المبيعات', status: 'SCHEDULED' };

/** Routes the two GETs this component makes: the graph, and the picker search. */
const respond = (deps: unknown) => {
  mockGet.mockImplementation((url: string) =>
    url.includes('/dependencies')
      ? Promise.resolve({ data: deps })
      : Promise.resolve({ data: { data: [dependent] } }),
  );
};

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const show = (canManage = true, systemId = "sys-1") =>
  render(<TicketDependencies ticketId="ticket-1" systemId={systemId} canManage={canManage} />, { wrapper });

beforeEach(() => {
  vi.clearAllMocks();
  respond({ blockedBy: [{ type: BLOCKS, blockingTicket: prerequisite }], blocking: [] });
  mockPost.mockResolvedValue({ data: {} });
  mockDelete.mockResolvedValue({ data: {} });
});

describe('TicketDependencies', () => {
  it('lists what the ticket is waiting on', async () => {
    show();

    await waitFor(() => expect(screen.getByText(/ربط البوابة/)).toBeInTheDocument());
    expect(screen.getByText('BRM-0120')).toBeInTheDocument();
  });

  it('counts the prerequisites that are still open', async () => {
    show();

    await waitFor(() =>
      expect(screen.getByText(`1 ${DEPENDENCY_LABELS.unmet}`)).toBeInTheDocument(),
    );
  });

  it.each(['COMPLETED', 'CLOSED'])('does not count a %s prerequisite as outstanding', async (status) => {
    respond({ blockedBy: [{ type: BLOCKS, blockingTicket: { ...prerequisite, status } }], blocking: [] });
    show();

    await waitFor(() => expect(screen.getByText(/ربط البوابة/)).toBeInTheDocument());
    expect(screen.queryByText(new RegExp(DEPENDENCY_LABELS.unmet))).not.toBeInTheDocument();
  });

  it('shows the tickets waiting on this one', async () => {
    respond({ blockedBy: [], blocking: [{ type: BLOCKS, blockedTicket: dependent }] });
    show();

    await waitFor(() => expect(screen.getAllByText(DEPENDENCY_LABELS.blocking).length).toBeGreaterThan(0));
    expect(screen.getByText(/تقرير المبيعات/)).toBeInTheDocument();
  });

  it('marks an unfinished blocking prerequisite with a required pill', async () => {
    show();

    await waitFor(() => expect(screen.getByText(/ربط البوابة/)).toBeInTheDocument());
    expect(screen.getByText(DEPENDENCY_LABELS.required)).toBeInTheDocument();
    expect(screen.getAllByText(DEPENDENCY_LABELS.blockedBy).length).toBeGreaterThan(0);
  });

  it('does not mark a completed blocking prerequisite as required', async () => {
    respond({ blockedBy: [{ type: BLOCKS, blockingTicket: { ...prerequisite, status: 'COMPLETED' } }], blocking: [] });
    show();

    await waitFor(() => expect(screen.getByText(/ربط البوابة/)).toBeInTheDocument());
    expect(screen.queryByText(DEPENDENCY_LABELS.required)).not.toBeInTheDocument();
  });

  it('groups relation kinds in a fixed order', async () => {
    respond({
      blockedBy: [
        { type: 'RELATES_TO', createdAt: '2026-08-20T10:00:00.000Z', blockingTicket: { ...prerequisite, id: 'r-1', ticketNumber: 50, title: 'ربط' } },
        { type: BLOCKS, createdAt: '2026-08-20T12:00:00.000Z', blockingTicket: prerequisite },
      ],
      blocking: [
        { type: BLOCKS, createdAt: '2026-08-20T11:00:00.000Z', blockedTicket: dependent },
      ],
    });
    show();

    await waitFor(() => expect(screen.getByText(/ربط البوابة/)).toBeInTheDocument());
    const labels = screen.getAllByText(/^(تعتمد على|تحجب|مرتبطة بـ)$/).map((el) => el.textContent);
    expect(labels).toEqual([
      DEPENDENCY_LABELS.blockedBy,
      DEPENDENCY_LABELS.blocking,
      'مرتبطة بـ',
    ]);
  });

  it('puts unfinished blocking prerequisites before completed ones', async () => {
    respond({
      blockedBy: [
        { type: BLOCKS, createdAt: '2026-08-20T12:00:00.000Z', blockingTicket: { ...prerequisite, id: 'done-1', ticketNumber: 1, title: 'منتهية', status: 'COMPLETED' } },
        { type: BLOCKS, createdAt: '2026-08-20T10:00:00.000Z', blockingTicket: { ...prerequisite, id: 'open-1', ticketNumber: 2, title: 'مفتوحة', status: 'IN_PROGRESS' } },
      ],
      blocking: [],
    });
    show();

    await waitFor(() => expect(screen.getByText('مفتوحة')).toBeInTheDocument());
    const links = screen.getAllByRole('link').map((a) => a.textContent);
    expect(links.findIndex((t) => t?.includes('مفتوحة'))).toBeLessThan(
      links.findIndex((t) => t?.includes('منتهية')),
    );
  });

  it('loads same-system tickets when the picker opens', async () => {
    const user = userEvent.setup();
    show();

    await waitFor(() => expect(screen.getByText(/ربط البوابة/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: DEPENDENCY_LABELS.add }));

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(expect.stringMatching(/systemId=sys-1.*limit=100|limit=100.*systemId=sys-1/)),
    );
    expect(await screen.findByRole('button', { name: /تقرير المبيعات/ })).toBeInTheDocument();
  });

  it('informs the user when the same relation is already listed', async () => {
    const user = userEvent.setup();
    respond({
      blockedBy: [{ type: BLOCKS, blockingTicket: dependent }],
      blocking: [],
    });
    show();

    await waitFor(() => expect(screen.getByText(/تقرير المبيعات/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: DEPENDENCY_LABELS.add }));
    await user.type(screen.getByPlaceholderText(DEPENDENCY_LABELS.pick), 'تقرير');
    await user.click(await screen.findByRole('button', { name: /تقرير المبيعات/ }));

    expect(mockPost).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(DEPENDENCY_LABELS.alreadyAdded);
  });

  it('adds a prerequisite through the API', async () => {
    const user = userEvent.setup();
    show();

    await waitFor(() => expect(screen.getByText(/ربط البوابة/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: DEPENDENCY_LABELS.add }));
    await user.type(screen.getByPlaceholderText(DEPENDENCY_LABELS.pick), 'تقرير');
    await user.click(await screen.findByRole('button', { name: /تقرير المبيعات/ }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/tickets/ticket-1/dependencies', {
        otherTicketId: 'ticket-7',
        direction: 'blockedBy',
        type: 'BLOCKS',
      }),
    );
  });

  it('asks before removing a prerequisite', async () => {
    const user = userEvent.setup();
    show();

    await waitFor(() => expect(screen.getByText(/ربط البوابة/)).toBeInTheDocument());
    await user.click(screen.getByLabelText(`${DEPENDENCY_LABELS.remove} BRM-0120`));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByText(DEPENDENCY_LABELS.removeConfirm)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: DEPENDENCY_LABELS.removeAction }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('/tickets/ticket-1/dependencies/ticket-9'),
    );
  });

  it('cancels relation removal without calling the API', async () => {
    const user = userEvent.setup();
    show();

    await waitFor(() => expect(screen.getByText(/ربط البوابة/)).toBeInTheDocument());
    await user.click(screen.getByLabelText(`${DEPENDENCY_LABELS.remove} BRM-0120`));
    await user.click(screen.getByRole('button', { name: DEPENDENCY_LABELS.cancel }));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.queryByText(DEPENDENCY_LABELS.removeConfirm)).not.toBeInTheDocument();
  });

  it('stays read-only for a role that cannot assign', async () => {
    show(false);

    await waitFor(() => expect(screen.getByText(/ربط البوابة/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: DEPENDENCY_LABELS.add })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(`${DEPENDENCY_LABELS.remove} BRM-0120`)).not.toBeInTheDocument();
  });

  it('takes up no room when there is nothing to show and nothing to add', async () => {
    respond({ blockedBy: [], blocking: [] });
    const { container } = show(false);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
