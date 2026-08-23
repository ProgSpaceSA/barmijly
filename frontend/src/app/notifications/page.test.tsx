import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = vi.fn();
const mockPatch = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import NotificationsPage from './page';

const unread = {
  id: 'n-1',
  type: 'TICKET_CREATED',
  title: 'تذكرة جديدة تنتظر المراجعة',
  body: 'هناك تذاكر جديدة بانتظار قرارك',
  isRead: false,
  ticketId: 'ticket-1',
  createdAt: new Date().toISOString(),
  ticket: {
    title: 'خطأ في احتساب الخصم عند الدفع النقدي',
    ticketNumber: 2,
    estimatedDeadline: '2026-08-21T00:00:00.000Z',
    status: 'NEW',
    company: { name: 'Retail Co' },
    system: { name: 'POS' },
  },
};

const read = {
  id: 'n-2',
  type: 'COMMENT_ADDED',
  title: 'تعليق جديد',
  body: 'أضاف داود الشمري تعليقاً على تذكرة التقارير',
  isRead: true,
  ticketId: 'ticket-2',
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  ticket: {
    title: 'توقف النظام عند إصدار الفواتير المجمعة',
    ticketNumber: 8,
    estimatedDeadline: null,
    status: 'IN_PROGRESS',
    company: { name: 'Group Holding' },
    system: { name: 'ERP' },
  },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotificationsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('unreadOnly=true')) {
      return Promise.resolve({
        data: { data: [unread], total: 1, page: 1, limit: 20, totalPages: 1 },
      });
    }
    if (url.startsWith('/notifications?')) {
      return Promise.resolve({
        data: { data: [unread, read], total: 2, page: 1, limit: 20, totalPages: 1 },
      });
    }
    if (url === '/notifications/unread-count') return Promise.resolve({ data: 1 });
    return Promise.resolve({ data: [] });
  });
  mockPatch.mockResolvedValue({ data: {} });
});

describe('NotificationsPage', () => {
  it('shows stored English titles in Arabic', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.startsWith('/notifications?')) {
        return Promise.resolve({
          data: {
            data: [{
              ...unread,
              type: 'COMMENT_ADDED',
              title: 'You were mentioned in a comment',
            }],
            total: 1, page: 1, limit: 20, totalPages: 1,
          },
        });
      }
      if (url === '/notifications/unread-count') return Promise.resolve({ data: 1 });
      return Promise.resolve({ data: [] });
    });

    renderPage();

    expect(await screen.findByText('تمت الإشارة إليك في تعليق')).toBeInTheDocument();
    expect(screen.queryByText('You were mentioned in a comment')).not.toBeInTheDocument();
  });

  it('renders compact rows and a ticket link, without a view-ticket button', async () => {
    renderPage();

    expect(await screen.findByText('تذكرة جديدة تنتظر المراجعة')).toBeInTheDocument();
    expect(screen.getByText('تذكرة جديدة')).toBeInTheDocument();
    expect(screen.getByText('تعليق')).toBeInTheDocument();
    expect(screen.getByText(/«خطأ في احتساب الخصم عند الدفع النقدي»/)).toBeInTheDocument();
    expect(screen.queryByText(/هناك تذاكر جديدة بانتظار قرارك/)).not.toBeInTheDocument();
    expect(screen.getByText('BRM-0002')).toBeInTheDocument();
    expect(screen.getByText('Retail Co - POS')).toBeInTheDocument();
    expect(screen.getByText('Group Holding - ERP')).toBeInTheDocument();
    expect(screen.getByTitle('تاريخ التسليم المتوقع')).toBeInTheDocument();
    expect(screen.queryByText('عرض التذكرة')).not.toBeInTheDocument();
    expect(screen.queryByText('عرض')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /معاينة/ })).not.toBeInTheDocument();

    const ticketLinks = screen.getAllByRole('link');
    expect(ticketLinks.some((el) => el.getAttribute('href') === '/tickets/ticket-1')).toBe(true);
  });

  it('marks one notification as read', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'تعليم كمقروء' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/notifications/n-1/read'));
  });

  it('marks all as read', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /قراءة الكل/ }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/notifications/read-all'));
  });

  it('keeps the all-count badge when the unread filter is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^الكل/ })).toHaveTextContent('2');
    });
    const unreadPill = screen.getByRole('button', { name: /^غير مقروء/ });
    expect(unreadPill).toHaveTextContent('1');

    await user.click(unreadPill);

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('unreadOnly=true')),
    );

    expect(screen.getByRole('button', { name: /^الكل/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /^غير مقروء/ })).toHaveTextContent('1');
    expect(screen.queryByText('تعليق جديد')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no notifications', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.startsWith('/notifications?')) {
        return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 20, totalPages: 0 } });
      }
      if (url === '/notifications/unread-count') return Promise.resolve({ data: 0 });
      return Promise.resolve({ data: [] });
    });

    renderPage();

    expect(await screen.findByText(/ستظهر هنا التحديثات على التذاكر والمهام/)).toBeInTheDocument();
  });
});
