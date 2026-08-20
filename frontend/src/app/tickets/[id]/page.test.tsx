import { Suspense } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = vi.fn();
const mockPatch = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const { authState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'user-1', role: 'PROGRAMMING_HEAD', firstName: 'ف', lastName: 'ل' },
  },
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: (selector?: (s: { user: typeof authState.user }) => unknown) =>
    typeof selector === 'function' ? selector(authState) : authState,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/tickets/CommentThread', () => ({
  CommentThread: () => null,
}));

import TicketDetailPage from './page';

const params = Object.assign(Promise.resolve({ id: 'ticket-1' }), {
  status: 'fulfilled',
  value: { id: 'ticket-1' },
}) as Promise<{ id: string }>;

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <TicketDetailPage params={params} />
      </Suspense>
    </QueryClientProvider>,
  );
  await act(async () => {});
  return result;
}

const ticket = {
  id: 'ticket-1',
  title: 'تعديل قالب الفاتورة',
  status: 'APPROVED',
  type: 'MODIFICATION',
  ticketNumber: 31,
  creatorId: 'creator-1',
  systemOwnerId: 'owner-1',
  companyId: 'co-1',
  systemId: 'sys-1',
  createdAt: '2026-08-19T00:00:00.000Z',
  description: 'وصف',
  reason: 'سبب',
  expectedOutcome: 'نتيجة',
  businessImpact: 'أثر',
  creator: { firstName: 'راشد', lastName: 'الدوسري' },
  system: { name: 'POS' },
  company: { id: 'co-1', name: 'Retail Co' },
  assignments: [],
  attachments: [],
  comments: [],
  statusHistory: [],
};

beforeEach(() => {
  authState.user = { id: 'user-1', role: 'PROGRAMMING_HEAD', firstName: 'ف', lastName: 'ل' };
  mockPatch.mockReset();
  mockPatch.mockResolvedValue({ data: { count: 0 } });
  mockGet.mockImplementation((url: unknown) => {
    const path = String(url);
    if (path.startsWith('/tickets/ticket-1/tasks')) return Promise.resolve({ data: [] });
    if (path.startsWith('/tickets/ticket-1')) return Promise.resolve({ data: ticket });
    if (path === '/users/mentionable') return Promise.resolve({ data: [] });
    if (path.startsWith('/systems/')) return Promise.resolve({ data: { id: 'sys-1' } });
    return Promise.resolve({ data: [] });
  });
});

describe('TicketDetailPage', () => {
  it('renders the loading skeleton without reading ticket fields', async () => {
    mockGet.mockImplementation(() => new Promise(() => {}));

    await renderPage();

    expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('التذكرة غير موجودة')).not.toBeInTheDocument();
  });

  it('shows التذكرة غير موجودة when the ticket is missing', async () => {
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets/ticket-1') && !path.includes('/tasks')) {
        return Promise.reject({ response: { status: 404 } });
      }
      return Promise.resolve({ data: [] });
    });

    await renderPage();

    expect(await screen.findByText('التذكرة غير موجودة')).toBeInTheDocument();
  });

  it('renders the ticket title once loaded', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'تعديل قالب الفاتورة' })).toBeInTheDocument();
    });
  });

  it('lets a system owner accept delivery they did not file', async () => {
    authState.user = { id: 'owner-all', role: 'SYSTEM_OWNER', firstName: 'مالك', lastName: 'الكل' };
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets/ticket-1/tasks')) return Promise.resolve({ data: [] });
      if (path.startsWith('/tickets/ticket-1')) {
        return Promise.resolve({ data: { ...ticket, status: 'AWAITING_OWNER_APPROVAL' } });
      }
      if (path === '/users/mentionable') return Promise.resolve({ data: [] });
      if (path.startsWith('/systems/')) return Promise.resolve({ data: { id: 'sys-1' } });
      return Promise.resolve({ data: [] });
    });

    await renderPage();

    expect(await screen.findByRole('button', { name: 'اعتماد الإكمال' })).toBeInTheDocument();
  });

  it('marks the ticket notifications as read once the ticket loads', async () => {
    await renderPage();

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/notifications/ticket/ticket-1/read');
    });
  });

  it('does not mark notifications as read when the ticket is missing', async () => {
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets/ticket-1') && !path.includes('/tasks')) {
        return Promise.reject({ response: { status: 404 } });
      }
      return Promise.resolve({ data: [] });
    });

    await renderPage();

    expect(await screen.findByText('التذكرة غير موجودة')).toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
