import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TicketAssignees } from './TicketAssignees';
import { ASSIGNEE_LABELS } from '@/lib/constants';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    patch: (...a: unknown[]) => mockPatch(...a),
    delete: (...a: unknown[]) => mockDelete(...a),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const DEVELOPERS = [
  { id: 'dev-1', firstName: 'ديمة', lastName: 'الحربي' },
  { id: 'dev-2', firstName: 'سارة', lastName: 'القحطاني' },
  { id: 'dev-3', firstName: 'عمر', lastName: 'الشمري' },
];

const roster = [
  { developerId: 'dev-1', isLead: true, developer: DEVELOPERS[0] },
  { developerId: 'dev-2', isLead: false, developer: DEVELOPERS[1] },
];

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const show = (canManage = true) =>
  render(
    <TicketAssignees ticketId="ticket-1" canManage={canManage} currentUserId="me" developers={DEVELOPERS} />,
    { wrapper },
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ data: roster });
  mockPost.mockResolvedValue({ data: roster });
  mockPatch.mockResolvedValue({ data: roster });
  mockDelete.mockResolvedValue({ data: roster });
});

describe('TicketAssignees', () => {
  it('lists everyone on the ticket and marks the lead', async () => {
    show();

    await waitFor(() => expect(screen.getByText('ديمة الحربي')).toBeInTheDocument());
    expect(screen.getByText('سارة القحطاني')).toBeInTheDocument();
    expect(screen.getByLabelText(`${ASSIGNEE_LABELS.lead}: ديمة الحربي`)).toBeInTheDocument();
    expect(screen.getByLabelText(`${ASSIGNEE_LABELS.contributor}: سارة القحطاني`)).toBeInTheDocument();
  });

  it('does not offer to promote the current lead', async () => {
    show();

    await waitFor(() => expect(screen.getByText('ديمة الحربي')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: `${ASSIGNEE_LABELS.makeLead}: ديمة الحربي` })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: `${ASSIGNEE_LABELS.makeLead}: سارة القحطاني` })).toHaveLength(1);
  });

  it('allows removing the lead', async () => {
    const user = userEvent.setup();
    show();

    await waitFor(() => expect(screen.getByText('ديمة الحربي')).toBeInTheDocument());
    await user.click(screen.getByLabelText(`${ASSIGNEE_LABELS.remove} ديمة الحربي`));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('/tickets/ticket-1/assignees/dev-1'),
    );
  });

  it('hands the lead over through the API', async () => {
    const user = userEvent.setup();
    show();

    await waitFor(() => expect(screen.getByText('سارة القحطاني')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: `${ASSIGNEE_LABELS.makeLead}: سارة القحطاني` }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/tickets/ticket-1/lead', { developerId: 'dev-2' }),
    );
  });

  it('removes a contributor through the API', async () => {
    const user = userEvent.setup();
    show();

    await waitFor(() => expect(screen.getByText('سارة القحطاني')).toBeInTheDocument());
    await user.click(screen.getByLabelText(`${ASSIGNEE_LABELS.remove} سارة القحطاني`));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('/tickets/ticket-1/assignees/dev-2'),
    );
  });

  it('marks the current roster member with a you badge beside their name', async () => {
    mockGet.mockResolvedValue({
      data: [{ developerId: 'me', isLead: false, developer: { id: 'me', firstName: 'ديمة', lastName: 'الحربي' } }],
    });
    render(
      <TicketAssignees ticketId="ticket-1" canManage={false} currentUserId="me" developers={DEVELOPERS} />,
      { wrapper },
    );

    await waitFor(() => expect(screen.getByText('ديمة الحربي')).toBeInTheDocument());
    expect(screen.getByText('أنت')).toBeInTheDocument();
  });

  it('shows no editing controls to a role that cannot assign', async () => {
    show(false);

    await waitFor(() => expect(screen.getByText('ديمة الحربي')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /تعيين كقائد/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(ASSIGNEE_LABELS.add)).not.toBeInTheDocument();
  });

  it('says so plainly when nobody is assigned yet', async () => {
    mockGet.mockResolvedValue({ data: [] });
    show();

    await waitFor(() => expect(screen.getByText(ASSIGNEE_LABELS.empty)).toBeInTheDocument());
  });
});
