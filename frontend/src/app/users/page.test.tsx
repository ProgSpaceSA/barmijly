import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: any[]) => mockGet(...args),
    patch: (...args: any[]) => mockPatch(...args),
    post: (...args: any[]) => mockPost(...args),
  },
}));

vi.mock('@/store/auth', () => ({
  // Honours the selector form, which usePermissions relies on to read the role.
  useAuthStore: (selector?: (s: any) => any) => {
    const state = {
      user: { id: 'me', role: 'PROGRAMMING_HEAD', firstName: 'ف', lastName: 'ل' },
      hasRole: () => true,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import UsersPage from './page';

const requester = {
  id: 'user-1',
  firstName: 'محمد',
  lastName: 'العلي',
  email: 'user@company.com',
  role: 'TICKET_REQUESTER',
  isActive: true,
  companies: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

/** Opens the edit modal for the row at `index` and returns it with its role <select>. */
async function openEditModal(user: ReturnType<typeof userEvent.setup>, index = 0) {
  const rows = await screen.findAllByRole('button', { name: 'تعديل' });
  await user.click(rows[index]);
  const modal = screen.getByText('تعديل بيانات المستخدم').closest('div.palette-modal') as HTMLElement;
  expect(modal).toBeTruthy();
  return { modal, roleSelect: within(modal).getByLabelText('الدور') as HTMLSelectElement };
}

beforeEach(() => {
  mockGet.mockImplementation((url: string) => {
    if (url === '/users') return Promise.resolve({ data: [requester] });
    if (url === '/companies') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
  mockPatch.mockResolvedValue({ data: {} });
});

describe('UsersPage — edit modal role field', () => {
  it('preselects the role the user currently holds', async () => {
    const user = userEvent.setup();
    renderPage();

    const { roleSelect } = await openEditModal(user);

    expect(roleSelect.value).toBe('TICKET_REQUESTER');
  });

  it('offers every assignable role', async () => {
    const user = userEvent.setup();
    renderPage();

    const { roleSelect } = await openEditModal(user);
    const values = Array.from(roleSelect.options).map(o => o.value);

    expect(values).toEqual([
      'SENIOR_MANAGEMENT',
      'PROGRAMMING_HEAD',
      'PROJECT_MANAGER',
      'DEVELOPER',
      'QA',
      'SYSTEM_OWNER',
      'TICKET_REQUESTER',
    ]);
  });

  it('sends the newly selected role in the PATCH body', async () => {
    const user = userEvent.setup();
    renderPage();

    const { modal, roleSelect } = await openEditModal(user);
    await user.selectOptions(roleSelect, 'DEVELOPER');
    await user.click(within(modal).getByRole('button', { name: 'حفظ التغييرات' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith(
      '/users/user-1',
      expect.objectContaining({ role: 'DEVELOPER', firstName: 'محمد', lastName: 'العلي' }),
    );
  });

  it('sends the unchanged role when only the name is edited', async () => {
    const user = userEvent.setup();
    renderPage();

    const { modal } = await openEditModal(user);
    const firstName = within(modal).getByLabelText('الاسم الأول');
    await user.clear(firstName);
    await user.type(firstName, 'أحمد');
    await user.click(within(modal).getByRole('button', { name: 'حفظ التغييرات' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith(
      '/users/user-1',
      expect.objectContaining({ role: 'TICKET_REQUESTER', firstName: 'أحمد' }),
    );
  });

  it('reopens with the target user\'s own role rather than the previous one', async () => {
    const developer = { ...requester, id: 'user-2', firstName: 'سارة', lastName: 'حسن', role: 'DEVELOPER' };
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url === '/users' ? [requester, developer] : [] }),
    );
    const user = userEvent.setup();
    renderPage();

    const first = await openEditModal(user, 0);
    expect(first.roleSelect.value).toBe('TICKET_REQUESTER');
    await user.click(within(first.modal).getByRole('button', { name: 'إلغاء' }));

    const second = await openEditModal(user, 1);

    expect(second.roleSelect.value).toBe('DEVELOPER');
  });

  it('blocks saving while a required field is empty', async () => {
    const user = userEvent.setup();
    renderPage();

    const { modal } = await openEditModal(user);
    await user.clear(within(modal).getByLabelText('الاسم الأول'));

    expect(within(modal).getByRole('button', { name: 'حفظ التغييرات' })).toBeDisabled();
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe('UsersPage — table overflow', () => {
  it('keeps the role label on one line and puts the full company list on hover', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/users') {
        return Promise.resolve({
          data: [{
            ...requester,
            role: 'PROGRAMMING_HEAD',
            companies: [
              { company: { id: 'c1', name: 'Group Holding' } },
              { company: { id: 'c2', name: 'Retail Co' } },
              { company: { id: 'c3', name: 'Logistics Co' } },
            ],
          }],
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderPage();

    const role = await screen.findByText('رئيس قسم البرمجة');
    expect(role.className).toContain('whitespace-nowrap');

    const companies = screen.getByText('Group Holding، Retail Co، Logistics Co');
    expect(companies).toHaveClass('truncate');
    expect(companies).toHaveAttribute('title', 'Group Holding، Retail Co، Logistics Co');
  });
});

describe('UsersPage — invite overlay', () => {
  it('keeps the backdrop outside the stacked page so space-y cannot shrink it', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'دعوة مستخدم' }));

    const heading = screen.getByRole('heading', { name: 'دعوة مستخدم جديد' });
    const overlay = heading.closest('.fixed');
    expect(overlay).toBeTruthy();
    expect(overlay!.closest('.space-y-6')).toBeNull();
  });
});
