import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TicketTimeline } from './TicketTimeline';
import { TIMELINE_FILTERS, TIMELINE_LABELS } from '@/lib/constants';

const mockGet = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => mockGet(...a) } }));

const { authState } = vi.hoisted(() => ({
  authState: { user: null as { id: string } | null },
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: (selector?: (s: { user: typeof authState.user }) => unknown) =>
    typeof selector === 'function' ? selector(authState) : authState,
}));

const actor = { id: 'pm-1', firstName: 'ريم', lastName: 'العتيبي', role: 'PROJECT_MANAGER' };
const dev = { id: 'dev-1', firstName: 'محمد', lastName: 'علي', role: 'DEVELOPER' };
const entry = (over: Record<string, unknown>) => ({
  id: Math.random().toString(36).slice(2),
  entity: 'Ticket',
  at: '2026-08-20T10:00:00.000Z',
  actor,
  subjects: [] as typeof dev[],
  from: null,
  to: null,
  ...over,
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const show = () => render(<TicketTimeline ticketId="ticket-1" />, { wrapper });

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
  mockGet.mockResolvedValue({ data: [] });
});

describe('TicketTimeline', () => {
  it('links the actor and shows the status verb', async () => {
    mockGet.mockResolvedValue({
      data: [entry({ action: 'STATUS_CHANGE', from: { status: 'SCHEDULED' }, to: { status: 'IN_PROGRESS' } })],
    });
    show();

    await waitFor(() => expect(screen.getByRole('link', { name: 'ريم العتيبي' })).toHaveAttribute('href', '/users/pm-1'));
    expect(screen.getByText('مدير المشروع')).toBeInTheDocument();
    expect(screen.getByText(TIMELINE_LABELS.STATUS_CHANGE)).toBeInTheDocument();
  });

  it('links the developer who was added', async () => {
    mockGet.mockResolvedValue({
      data: [entry({ action: 'ASSIGNEE_ADD', to: { developerId: 'dev-1' }, subjects: [dev] })],
    });
    show();

    await waitFor(() => expect(screen.getByRole('link', { name: 'محمد علي' })).toHaveAttribute('href', '/users/dev-1'));
    expect(screen.getByText('مطور')).toBeInTheDocument();
    expect(screen.getByText(TIMELINE_LABELS.ASSIGNEE_ADD)).toBeInTheDocument();
  });

  it('spells out a status move in Arabic, both ends', async () => {
    mockGet.mockResolvedValue({
      data: [entry({ action: 'STATUS_CHANGE', from: { status: 'IN_PROGRESS' }, to: { status: 'BLOCKED' } })],
    });
    show();

    await waitFor(() => expect(screen.getByText(/قيد التنفيذ/)).toBeInTheDocument());
    expect(screen.getByText(/متوقفة/)).toBeInTheDocument();
  });

  it('carries the documented reason for a stop', async () => {
    mockGet.mockResolvedValue({
      data: [entry({
        action: 'STATUS_CHANGE',
        from: { status: 'IN_PROGRESS' },
        to: { status: 'BLOCKED', reason: 'بانتظار المورّد' },
      })],
    });
    show();

    await waitFor(() => expect(screen.getByText(/بانتظار المورّد/)).toBeInTheDocument());
  });

  it('filters to assignment events only', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({
      data: [
        entry({ action: 'STATUS_CHANGE', from: { status: 'NEW' }, to: { status: 'APPROVED' } }),
        entry({ action: 'ASSIGNEE_ADD', to: { developerId: 'dev-1' }, subjects: [dev] }),
      ],
    });
    show();

    await waitFor(() => expect(screen.getByText(TIMELINE_LABELS.ASSIGNEE_ADD)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: TIMELINE_FILTERS.assign.label }));

    expect(screen.queryByText(TIMELINE_LABELS.STATUS_CHANGE)).not.toBeInTheDocument();
    expect(screen.getByText(TIMELINE_LABELS.ASSIGNEE_ADD)).toBeInTheDocument();
  });

  it('shows a you badge beside the actor when they are the viewer', async () => {
    authState.user = { id: 'dev-1' };
    mockGet.mockResolvedValue({
      data: [entry({
        action: 'TASK_STATUS_CHANGE',
        entity: 'TicketTask',
        actor: dev,
        subjects: [dev],
        from: { title: 'Self', status: 'IN_PROGRESS' },
        to: { title: 'Self', status: 'COMPLETED' },
      })],
    });
    show();

    await waitFor(() => expect(screen.getAllByText('محمد علي').length).toBeGreaterThan(0));
    expect(screen.getByText('أنت')).toBeInTheDocument();
  });

  it('names the task and spells out the status move', async () => {
    mockGet.mockResolvedValue({
      data: [entry({
        action: 'TASK_STATUS_CHANGE',
        entity: 'TicketTask',
        subjects: [dev],
        from: { title: 'ربط الـ API', status: 'IN_PROGRESS' },
        to: { title: 'ربط الـ API', status: 'COMPLETED' },
      })],
    });
    show();

    await waitFor(() => expect(screen.getByText('«ربط الـ API»')).toBeInTheDocument());
    expect(screen.getByText(/من جارٍ إلى مكتملة/)).toBeInTheDocument();
  });

  it('labels plan updates and spells out what changed', async () => {
    mockGet.mockResolvedValue({
      data: [entry({
        action: 'PLAN_UPDATED',
        from: { estimatedHours: 10, difficultyLevel: 2, estimatedDeadline: '2026-12-01' },
        to: { estimatedHours: 50, difficultyLevel: 4, estimatedDeadline: '2026-12-15' },
      })],
    });
    show();

    await waitFor(() => expect(screen.getByText(TIMELINE_LABELS.PLAN_UPDATED)).toBeInTheDocument());
    expect(screen.getByText(/ساعات مقدّرة: من 10 إلى 50/)).toBeInTheDocument();
    expect(screen.getByText(/الصعوبة: من سهلة إلى صعبة/)).toBeInTheDocument();
    expect(screen.getByText(/تاريخ التسليم: من 2026-12-01 إلى 2026-12-15/)).toBeInTheDocument();
  });

  it('labels task edits and spells out what changed', async () => {
    mockGet.mockResolvedValue({
      data: [entry({
        action: 'TASK_UPDATE',
        entity: 'TicketTask',
        subjects: [dev],
        from: { title: 'Self', estimatedHours: 4, difficultyLevel: 1, assignedToId: 'dev-1' },
        to: { title: 'Self', estimatedHours: 10, difficultyLevel: 4, assignedToId: 'dev-1' },
      })],
    });
    show();

    await waitFor(() => expect(screen.getByText(TIMELINE_LABELS.TASK_UPDATE)).toBeInTheDocument());
    expect(screen.getByText(/ساعات مقدّرة: من 4 إلى 10/)).toBeInTheDocument();
    expect(screen.getByText(/الصعوبة: من بسيطة إلى صعبة/)).toBeInTheDocument();
  });

  it('shows new plan values when older audit rows lack oldValues', async () => {
    mockGet.mockResolvedValue({
      data: [entry({
        action: 'PLAN_UPDATED',
        to: { estimatedHours: 8, difficultyLevel: 3 },
      })],
    });
    show();

    await waitFor(() => expect(screen.getByText(/ساعات مقدّرة: 8/)).toBeInTheDocument());
    expect(screen.getByText(/الصعوبة: متوسطة/)).toBeInTheDocument();
  });

  it('shows the status move even when the task title is missing', async () => {
    mockGet.mockResolvedValue({
      data: [entry({
        action: 'TASK_STATUS_CHANGE',
        entity: 'TicketTask',
        from: { status: 'NEW' },
        to: { status: 'IN_PROGRESS' },
      })],
    });
    show();

    await waitFor(() => expect(screen.getByText(/من جديدة إلى جارٍ/)).toBeInTheDocument());
  });

  it('shows the linked ticket and relation kind for a dependency add', async () => {
    mockGet.mockResolvedValue({
      data: [entry({
        action: 'DEPENDENCY_ADD',
        relation: {
          label: 'أضاف اعتماداً على',
          ticket: { id: 'ticket-9', ticketNumber: 120, title: 'ربط البوابة' },
        },
      })],
    });
    show();

    await waitFor(() => expect(screen.getByText('أضاف اعتماداً على')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /ربط البوابة/ })).toHaveAttribute('href', '/tickets/ticket-9');
    expect(screen.getByText('BRM-0120')).toBeInTheDocument();
    expect(screen.getByText('مدير المشروع')).toBeInTheDocument();
  });

  it('renders relation from embedded audit snapshot when relation field is missing', async () => {
    mockGet.mockResolvedValue({
      data: [entry({
        action: 'DEPENDENCY_ADD',
        to: {
          blockingTicketId: 'ticket-9',
          blockedTicketId: 'ticket-1',
          type: 'BLOCKS',
          otherTicket: { id: 'ticket-9', ticketNumber: 120, title: 'ربط البوابة' },
        },
      })],
    });
    show();

    await waitFor(() => expect(screen.getByText('أضاف اعتماداً على')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /ربط البوابة/ })).toHaveAttribute('href', '/tickets/ticket-9');
  });

  it('falls back to the raw action rather than rendering nothing', async () => {
    mockGet.mockResolvedValue({ data: [entry({ action: 'SOMETHING_NEW' })] });
    show();

    await waitFor(() => expect(screen.getByText('SOMETHING_NEW')).toBeInTheDocument());
  });

  it('says so plainly when nothing has happened', async () => {
    show();

    await waitFor(() => expect(screen.getByText(TIMELINE_LABELS.empty)).toBeInTheDocument());
  });
});
