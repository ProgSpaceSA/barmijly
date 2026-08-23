import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PRIORITY_LABELS, SELECT_PLACEHOLDERS, TICKET_TYPE_LABELS } from '@/lib/constants';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: vi.fn(),
  },
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: (selector?: (s: { user: { id: string; role: string } }) => unknown) => {
    const state = { user: { id: 'me', role: 'PROGRAMMING_HEAD' } };
    return selector ? selector(state) : state;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import NewTicketPage from './page';

const company = { id: '11111111-1111-4111-8111-111111111111', name: 'شركة أ' };
const systems = [
  { id: '22222222-2222-4222-8222-222222222222', name: 'نظام أ' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'نظام ب' },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NewTicketPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGet.mockImplementation((url: string) => {
    if (url === '/companies') return Promise.resolve({ data: [company] });
    if (typeof url === 'string' && url.startsWith('/systems')) {
      return Promise.resolve({ data: systems });
    }
    return Promise.resolve({ data: [] });
  });
});

describe('NewTicketPage — dropdowns', () => {
  it('uses the design-system combobox for company, system, type, and priority', async () => {
    const user = userEvent.setup();
    renderPage();

    const companyTrigger = await screen.findByRole('combobox', { name: SELECT_PLACEHOLDERS.company });
    expect(companyTrigger).toHaveAttribute('data-slot', 'select-trigger');
    expect(screen.getByRole('combobox', { name: SELECT_PLACEHOLDERS.system })).toHaveAttribute('data-slot', 'select-trigger');
    expect(screen.getByRole('combobox', { name: SELECT_PLACEHOLDERS.ticketType })).toHaveAttribute('data-slot', 'select-trigger');
    expect(screen.getByRole('combobox', { name: SELECT_PLACEHOLDERS.priority })).toHaveAttribute('data-slot', 'select-trigger');
    expect(document.querySelector('select')).toBeNull();

    await user.click(companyTrigger);
    await user.click(await screen.findByRole('option', { name: company.name }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: SELECT_PLACEHOLDERS.company })).toHaveTextContent(company.name);
    });

    const systemTrigger = screen.getByRole('combobox', { name: SELECT_PLACEHOLDERS.system });
    await user.click(systemTrigger);
    expect(await screen.findByRole('option', { name: systems[0].name })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: systems[1].name })).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: SELECT_PLACEHOLDERS.ticketType }));
    expect(await screen.findByRole('option', { name: TICKET_TYPE_LABELS.BUG_FIX })).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: SELECT_PLACEHOLDERS.priority }));
    expect(await screen.findByRole('option', { name: PRIORITY_LABELS.HIGH })).toBeInTheDocument();
  });
});
