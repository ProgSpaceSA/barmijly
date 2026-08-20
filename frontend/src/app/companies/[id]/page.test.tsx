import { Suspense } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

/** Swapped per test so the same page can be rendered as any role. */
let currentRole = 'PROGRAMMING_HEAD';

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: any[]) => mockGet(...args),
    patch: (...args: any[]) => mockPatch(...args),
    post: (...args: any[]) => mockPost(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}));

vi.mock('@/store/auth', () => ({
  // Honours the selector form, which usePermissions relies on to read the role.
  useAuthStore: (selector?: (s: any) => any) => {
    const state = { user: { id: 'user-1', role: currentRole } };
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

import CompanyDetailPage from './page';

const company = {
  id: 'company-1',
  name: 'أبو زيد',
  domain: 'abuzaid.com',
  isActive: true,
  departments: [{ id: 'dept-1', name: 'المالية' }],
  systems: [{ id: 'sys-1', name: 'مدار', description: 'نظام المبيعات' }],
  _count: { users: 9, tickets: 15 },
};

/**
 * `use()` reads a *fulfilled* thenable synchronously. A bare promise suspends, and the
 * retry that follows never flushes reliably under jsdom — so hand it one already settled.
 */
const params = Object.assign(Promise.resolve({ id: 'company-1' }), {
  status: 'fulfilled',
  value: { id: 'company-1' },
}) as Promise<{ id: string }>;

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <CompanyDetailPage params={params} />
      </Suspense>
    </QueryClientProvider>,
  );
  // `use(params)` suspends on first render; flush it before querying the tree.
  await act(async () => {});
  return result;
}

beforeEach(() => {
  currentRole = 'PROGRAMMING_HEAD';
  mockGet.mockImplementation((url: string) => {
    if (url === '/companies/company-1') return Promise.resolve({ data: company });
    if (url.startsWith('/tickets')) return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: [] });
  });
  mockPatch.mockResolvedValue({ data: {} });
});

describe('CompanyDetailPage — updating for permitted roles', () => {
  it('sends the edited company fields to PATCH /companies/:id', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole('button', { name: 'تعديل' }));
    const name = screen.getByLabelText('اسم الشركة');
    await user.clear(name);
    await user.type(name, 'أبو زيد القابضة');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/companies/company-1', {
      name: 'أبو زيد القابضة',
      nameAr: null,
      domain: 'abuzaid.com',
    });
  });

  it('sends the edited system fields to PATCH /systems/:id', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole('button', { name: 'تعديل النظام مدار' }));
    const name = screen.getByLabelText('اسم النظام');
    await user.clear(name);
    await user.type(name, 'مدار الجديد');
    await user.type(screen.getByLabelText('النطاق (اختياري)'), 'madar.local');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/systems/sys-1', {
      name: 'مدار الجديد',
      description: 'نظام المبيعات',
      domain: 'madar.local',
    });
  });

  it('keeps the system name required', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole('button', { name: 'تعديل النظام مدار' }));
    await user.clear(screen.getByLabelText('اسم النظام'));

    expect(screen.getByRole('button', { name: 'حفظ' })).toBeDisabled();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('hides both edit affordances from a requester', async () => {
    currentRole = 'TICKET_REQUESTER';
    await renderPage();

    expect(await screen.findByText('مدار')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعديل' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعديل النظام مدار' })).not.toBeInTheDocument();
  });

  it('shows the developer name in the assign field, not the id', async () => {
    const devId = '4e464ee3-949e-447d-ab3a-628826ebdb30';
    mockGet.mockImplementation((url: string) => {
      if (url === '/companies/company-1') return Promise.resolve({ data: company });
      if (url.startsWith('/tickets')) return Promise.resolve({ data: { data: [] } });
      if (url === '/users') {
        return Promise.resolve({
          data: [{ id: devId, firstName: 'ديمة', lastName: 'الحربي', role: 'DEVELOPER' }],
        });
      }
      if (url === '/systems/sys-1') return Promise.resolve({ data: { id: 'sys-1', userSystems: [] } });
      return Promise.resolve({ data: [] });
    });

    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole('button', { name: 'مدار' }));
    await user.click(await screen.findByRole('button', { name: /تعيين مطور/ }));

    expect(screen.getByRole('combobox')).toHaveTextContent('اختر المطور');

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'اختر المطور' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'ديمة الحربي' }));

    expect(screen.queryByText(devId)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent('ديمة الحربي');
  });
});
