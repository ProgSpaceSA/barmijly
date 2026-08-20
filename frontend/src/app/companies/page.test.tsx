import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import CompaniesPage from './page';

const company = {
  id: 'company-1',
  name: 'أبو زيد',
  domain: 'abuzaid.com',
  departments: [{ id: 'dept-1', name: 'المالية' }],
  systems: [{ id: 'sys-1', name: 'مدار', isActive: true }],
  _count: { users: 9, tickets: 15 },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CompaniesPage />
    </QueryClientProvider>,
  );
}

/** Opens the company row so the departments/systems panel is in the DOM. */
async function expandCompany(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /أبو زيد/ }));
}

beforeEach(() => {
  currentRole = 'PROGRAMMING_HEAD';
  mockGet.mockResolvedValue({ data: [company] });
  mockPatch.mockResolvedValue({ data: {} });
});

describe('CompaniesPage — updating for permitted roles', () => {
  it('sends the edited company fields to PATCH /companies/:id', async () => {
    const user = userEvent.setup();
    renderPage();
    await expandCompany(user);

    await user.click(screen.getByRole('button', { name: 'تعديل بيانات الشركة' }));
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

  it('sends null for an optional company field that was cleared', async () => {
    const user = userEvent.setup();
    renderPage();
    await expandCompany(user);

    await user.click(screen.getByRole('button', { name: 'تعديل بيانات الشركة' }));
    await user.clear(screen.getByLabelText('النطاق (اختياري)'));
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith(
      '/companies/company-1',
      expect.objectContaining({ domain: null }),
    );
  });

  it('renames a department through PATCH /departments/:id', async () => {
    const user = userEvent.setup();
    renderPage();
    await expandCompany(user);

    await user.click(screen.getByRole('button', { name: 'تعديل القسم المالية' }));
    const input = screen.getByDisplayValue('المالية');
    await user.clear(input);
    await user.type(input, 'المالية والمحاسبة');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/departments/dept-1', { name: 'المالية والمحاسبة' });
  });

  it('renames a system through PATCH /systems/:id', async () => {
    const user = userEvent.setup();
    renderPage();
    await expandCompany(user);

    await user.click(screen.getByRole('button', { name: 'تعديل' }));
    const input = screen.getByDisplayValue('مدار');
    await user.clear(input);
    await user.type(input, 'مدار الجديد');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/systems/sys-1', { name: 'مدار الجديد' });
  });

  it('deactivates a system instead of calling a delete route that does not exist', async () => {
    const user = userEvent.setup();
    renderPage();
    await expandCompany(user);

    await user.click(screen.getByRole('button', { name: 'تعطيل' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/systems/sys-1/deactivate');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('reactivates an inactive system', async () => {
    mockGet.mockResolvedValue({
      data: [{ ...company, systems: [{ id: 'sys-1', name: 'مدار', isActive: false }] }],
    });
    const user = userEvent.setup();
    renderPage();
    await expandCompany(user);

    await user.click(screen.getByRole('button', { name: 'تفعيل' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/systems/sys-1/activate');
    expect(screen.queryByRole('button', { name: 'تعطيل' })).not.toBeInTheDocument();
  });

  // req.md §2: a project manager prioritises, assigns and follows up. The org
  // chart belongs to the head of programming and senior management.
  it('hides every edit affordance from a project manager', async () => {
    currentRole = 'PROJECT_MANAGER';
    mockGet.mockResolvedValue({
      data: [{ ...company, systems: [{ id: 'sys-1', name: 'مدار', isActive: false }] }],
    });
    const user = userEvent.setup();
    renderPage();
    await expandCompany(user);

    expect(screen.queryByRole('button', { name: 'تعديل بيانات الشركة' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعديل القسم المالية' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعطيل' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تفعيل' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /إضافة شركة/ })).not.toBeInTheDocument();
  });

  it('hides every edit affordance from a requester', async () => {
    currentRole = 'TICKET_REQUESTER';
    const user = userEvent.setup();
    renderPage();
    await expandCompany(user);

    expect(screen.queryByRole('button', { name: 'تعديل بيانات الشركة' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعديل القسم المالية' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعديل' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعطيل' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تفعيل' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /إضافة شركة/ })).not.toBeInTheDocument();
  });
});

describe('CompaniesPage — company tickets link', () => {
  it('opens the company page from تذاكر الشركة', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'تذاكر الشركة' });
    expect(link).toHaveAttribute('href', '/companies/company-1');
  });
});
