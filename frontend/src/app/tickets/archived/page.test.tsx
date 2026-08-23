import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const mockGet = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', role: 'PROGRAMMING_HEAD', firstName: 'ف', lastName: 'ل' },
  }),
}));

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ArchivedTicketsPage from './page';

const archivedTicket = {
  id: 'ticket-1',
  title: '[C1/P2][CLOSED] طلب قديم مؤرشف',
  status: 'CLOSED',
  type: 'MODIFICATION',
  ticketNumber: 29,
  priority: 'LOW',
  finalPriority: 'LOW',
  estimatedDeadline: '2026-08-18T00:00:00.000Z',
  createdAt: '2026-08-19T00:00:00.000Z',
  creator: { id: 'c1', firstName: 'راشد', lastName: 'الدوسري' },
  system: { name: 'Project2' },
  company: { id: 'co1', name: 'Company1' },
  assignments: [{ developer: { firstName: 'ديمة', lastName: 'الحربي' } }],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ArchivedTicketsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGet.mockImplementation((url: unknown) => {
    const path = String(url);
    if (path.startsWith('/tickets')) {
      return Promise.resolve({ data: { data: [archivedTicket], total: 1, page: 1, limit: 20, totalPages: 1 } });
    }
    if (path === '/companies') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

describe('ArchivedTicketsPage', () => {
  it('loads archived tickets', async () => {
    renderPage();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/tickets?isArchived=true');
    });
  });

  it('uses the same card tooltips as the tickets list', async () => {
    renderPage();

    const due = `التسليم: ${format(new Date(archivedTicket.estimatedDeadline), 'd MMM yyyy', { locale: ar })}`;
    expect(await screen.findByText(archivedTicket.title)).toBeInTheDocument();
    expect(screen.getByText('مؤرشفة')).toBeInTheDocument();
    expect(screen.getByTitle('طالب التذكرة')).toHaveTextContent('راشد الدوسري');
    expect(screen.getByTitle('النظام')).toHaveTextContent('Project2');
    expect(screen.getByTitle('الشركة')).toHaveTextContent('Company1');
    expect(screen.getByTitle('تاريخ التسليم المتوقع')).toHaveTextContent(due);
    expect(screen.getByTitle(/^تاريخ الإنشاء/)).toBeInTheDocument();
    expect(screen.getByTitle('المطور المُكلَّف: ديمة الحربي')).toBeInTheDocument();
  });
});
