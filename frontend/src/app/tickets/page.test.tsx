import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = vi.fn();
const mockSearchParams = new URLSearchParams();
let currentRole = 'PROGRAMMING_HEAD';

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', role: currentRole, firstName: 'ف', lastName: 'ل' },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import TicketsPage from './page';
import { TICKET_ACTION_INBOX_LABEL, TICKET_CREATED_BY_ME_LABEL } from '@/lib/constants';
import { ticketActionInboxStatuses } from '@/lib/ticket-list-filters';

const HEAD_APPROVAL = { statuses: 'NEW,AWAITING_APPROVAL' };

function listUrl(filters: Record<string, string>) {
  return `/tickets?${new URLSearchParams(filters).toString()}`;
}

const overdueTicket = {
  id: 'ticket-1',
  title: 'تعديل قالب الفاتورة',
  status: 'SCHEDULED',
  type: 'MODIFICATION',
  ticketNumber: 31,
  priority: 'CRITICAL',
  finalPriority: 'CRITICAL',
  estimatedDeadline: '2026-08-18T00:00:00.000Z',
  createdAt: '2026-08-19T00:00:00.000Z',
  creator: { id: 'c1', firstName: 'راشد', lastName: 'الدوسري' },
  system: { name: 'POS' },
  company: { id: 'co1', name: 'Retail Co' },
  assignments: [],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TicketsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentRole = 'PROGRAMMING_HEAD';
  mockSearchParams.delete('overdue');
  mockSearchParams.delete('mine');
  mockSearchParams.delete('developerId');
  mockSearchParams.delete('status');
  mockSearchParams.delete('statuses');
  mockGet.mockImplementation((url: unknown) => {
    const path = String(url);
    if (path.startsWith('/tickets')) {
      return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 20, totalPages: 0 } });
    }
    if (path === '/companies') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

describe('TicketsPage — role defaults', () => {
  it('opens the programming head on the approval queue', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: 'بانتظار اعتمادك' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(listUrl(HEAD_APPROVAL));
    });
  });

  it('opens a developer on تذاكري', async () => {
    currentRole = 'DEVELOPER';
    renderPage();

    expect(await screen.findByRole('button', { name: 'تذاكري' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(listUrl({ mine: 'true' }));
    });
  });

  it('opens the project manager on معتمدة', async () => {
    currentRole = 'PROJECT_MANAGER';
    renderPage();

    expect(await screen.findByRole('button', { name: 'معتمدة' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(listUrl({ status: 'APPROVED' }));
    });
  });

  it('opens QA on بانتظار اختبار', async () => {
    currentRole = 'QA';
    renderPage();

    expect(await screen.findByRole('button', { name: 'بانتظار اختبار' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(listUrl({ status: 'AWAITING_TESTING' }));
    });
  });

  it('keeps dashboard overdue=true instead of the role default', async () => {
    mockSearchParams.set('overdue', 'true');
    renderPage();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/tickets?overdue=true');
    });
    expect(mockGet.mock.calls.some(([url]) => String(url).includes('statuses='))).toBe(false);
  });
});

describe('TicketsPage — status filter', () => {
  it('requests overdue tickets when opened with overdue=true', async () => {
    mockSearchParams.set('overdue', 'true');
    renderPage();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/tickets?overdue=true');
    });
  });

  it('lists every ticket status plus overdue and the approval inbox for programming head', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: 'الكل' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TICKET_ACTION_INBOX_LABEL })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بانتظار اعتمادك' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مسودة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'جديدة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بانتظار معلومات' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بانتظار الاعتماد' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'معتمدة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مرفوضة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مجدولة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'قيد التنفيذ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بانتظار اختبار' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بانتظار اعتماد المالك' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مكتملة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مغلقة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'معلقة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'متأخرة' })).toBeInTheDocument();
  });

  it('lists مسودة and requests draft tickets when it is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'مسودة' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/tickets?status=DRAFT');
    });
  });

  it('requests awaiting-approval tickets when بانتظار الاعتماد is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'بانتظار الاعتماد' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/tickets?status=AWAITING_APPROVAL');
    });
  });

  it('shows a ticket requester the statuses they act on, not the programming queue', async () => {
    currentRole = 'TICKET_REQUESTER';
    renderPage();

    expect(await screen.findByRole('button', { name: 'الكل' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مسودة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بانتظار معلومات' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مرفوضة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بانتظار اعتماد المالك' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مكتملة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'متأخرة' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'بانتظار الاعتماد' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'مجدولة' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'قيد التنفيذ' })).not.toBeInTheDocument();
  });

  it('lists تحتاج إجراء and requests the head\'s action statuses', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: TICKET_ACTION_INBOX_LABEL }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        listUrl({ statuses: ticketActionInboxStatuses('PROGRAMMING_HEAD').join(',') }),
      );
    });
  });

  it('requests awaiting-info tickets when a requester selects بانتظار معلومات', async () => {
    currentRole = 'TICKET_REQUESTER';
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'بانتظار معلومات' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/tickets?status=AWAITING_INFO');
    });
  });

  it('shows a developer scheduled and in-progress, not drafts', async () => {
    currentRole = 'DEVELOPER';
    renderPage();

    expect(await screen.findByRole('button', { name: 'مجدولة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'قيد التنفيذ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'معتمدة' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'مسودة' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'بانتظار الاعتماد' })).not.toBeInTheDocument();
  });

  it('lists متأخرة and requests overdue tickets when it is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'متأخرة' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/tickets?overdue=true');
    });
  });

  it('clears overdue when switching back to a status pill', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'متأخرة' }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/tickets?overdue=true'));

    await user.click(screen.getByRole('button', { name: 'جديدة' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/tickets?status=NEW');
    });
    expect(mockGet.mock.calls.some(([url]) => String(url).includes('overdue=true') && String(url).includes('status='))).toBe(false);
  });

  it('shows the delivery date on a ticket card', async () => {
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets')) {
        return Promise.resolve({ data: { data: [overdueTicket], total: 1, page: 1, limit: 20, totalPages: 1 } });
      }
      if (path === '/companies') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    renderPage();

    const due = `التسليم: ${format(new Date(overdueTicket.estimatedDeadline), 'd MMM yyyy', { locale: ar })}`;
    expect(await screen.findByText(due)).toBeInTheDocument();
    expect(screen.getByTitle('طالب التذكرة')).toHaveTextContent('راشد الدوسري');
    expect(screen.getByTitle('النظام')).toHaveTextContent('POS');
    expect(screen.getByTitle('الشركة')).toHaveTextContent('Retail Co');
    expect(screen.getByTitle('تاريخ التسليم المتوقع')).toHaveTextContent(due);
    expect(screen.getByTitle(/^تاريخ الإنشاء/)).toBeInTheDocument();
  });

  it('shows the assigned developer name in the avatar tooltip', async () => {
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets')) {
        return Promise.resolve({
          data: {
            data: [{
              ...overdueTicket,
              assignments: [{ developer: { id: 'dev-1', firstName: 'ديمة', lastName: 'الحربي' } }],
            }],
            total: 1,
            page: 1,
            limit: 20,
            totalPages: 1,
          },
        });
      }
      if (path === '/companies') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    renderPage();

    const avatar = await screen.findByTitle('المطور المُكلَّف: ديمة الحربي');
    expect(avatar).toHaveAttribute('aria-label', 'المطور المُكلَّف: ديمة الحربي');
    expect(avatar).toHaveTextContent('د');
  });
});

describe('TicketsPage — mine filter', () => {
  it('requests the caller\'s assigned tickets when opened with mine=true', async () => {
    mockSearchParams.set('mine', 'true');
    renderPage();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/tickets?mine=true');
    });
  });

  it('lists تذاكري and requests mine=true when it is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'تذاكري' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(listUrl({ ...HEAD_APPROVAL, mine: 'true' }));
    });
  });

  it('keeps تذاكري alongside a status pill', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'تذاكري' }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(listUrl({ ...HEAD_APPROVAL, mine: 'true' })));

    await user.click(screen.getByRole('button', { name: 'معتمدة' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(listUrl({ status: 'APPROVED', mine: 'true' }));
    });
  });

  it('clears mine when switching back to كل التذاكر', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'تذاكري' }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(listUrl({ ...HEAD_APPROVAL, mine: 'true' })));

    await user.click(screen.getByRole('button', { name: 'كل التذاكر' }));

    await waitFor(() => {
      const ticketCalls = mockGet.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.startsWith('/tickets'));
      expect(ticketCalls.at(-1)).toBe(listUrl(HEAD_APPROVAL));
    });
  });

  it('lists أنشأتها and requests creatorId when it is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: TICKET_CREATED_BY_ME_LABEL }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(listUrl({ ...HEAD_APPROVAL, creatorId: 'user-1' }));
    });
  });

  it('hides أنشأتها from a ticket requester', async () => {
    currentRole = 'TICKET_REQUESTER';
    renderPage();

    expect(await screen.findByRole('button', { name: 'تذاكري' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: TICKET_CREATED_BY_ME_LABEL })).not.toBeInTheDocument();
  });
});

const teamDevelopers = [
  { id: 'dev-1', firstName: 'ديمة', lastName: 'الحربي' },
  { id: 'dev-2', firstName: 'سعد', lastName: 'القحطاني' },
];

describe('TicketsPage — developer assignment filter', () => {
  beforeEach(() => {
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets')) {
        return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 20, totalPages: 0 } });
      }
      if (path === '/companies') return Promise.resolve({ data: [] });
      if (path === '/users/developers') return Promise.resolve({ data: teamDevelopers });
      return Promise.resolve({ data: [] });
    });
  });

  it('requests the developer\'s assigned tickets when opened with developerId', async () => {
    mockSearchParams.set('developerId', 'dev-1');
    renderPage();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/tickets?developerId=dev-1');
    });
  });

  it('lists developers beside الإسناد and requests developerId when one is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'التذاكر المُسندة إلى ديمة الحربي' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(listUrl({ ...HEAD_APPROVAL, developerId: 'dev-1' }));
    });
  });

  it('keeps the developer filter alongside a status pill', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'التذاكر المُسندة إلى سعد القحطاني' }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(listUrl({ ...HEAD_APPROVAL, developerId: 'dev-2' })));

    await user.click(screen.getByRole('button', { name: 'معتمدة' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(listUrl({ status: 'APPROVED', developerId: 'dev-2' }));
    });
  });

  it('clears the developer when switching to تذاكري', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'التذاكر المُسندة إلى ديمة الحربي' }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(listUrl({ ...HEAD_APPROVAL, developerId: 'dev-1' })));

    await user.click(screen.getByRole('button', { name: 'تذاكري' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(listUrl({ ...HEAD_APPROVAL, mine: 'true' }));
    });
    expect(mockGet.mock.calls.some(([url]) => String(url).includes('mine=true') && String(url).includes('developerId='))).toBe(false);
  });

  it('does not list developers or request the roster for a developer', async () => {
    currentRole = 'DEVELOPER';
    renderPage();

    expect(await screen.findByRole('button', { name: 'تذاكري' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'التذاكر المُسندة إلى ديمة الحربي' })).not.toBeInTheDocument();
    expect(mockGet.mock.calls.some(([url]) => String(url) === '/users/developers')).toBe(false);
  });
});
