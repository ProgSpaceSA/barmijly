import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();

/** Swapped per test so the same page can be rendered as any role. */
let currentRole = 'PROGRAMMING_HEAD';

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
      user: { id: 'me', role: currentRole, firstName: 'ف', lastName: 'ل' },
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

/** Opens the edit modal for the row at `index` and returns it with its role picker. */
async function openEditModal(user: ReturnType<typeof userEvent.setup>, index = 0) {
  const rows = await screen.findAllByRole('button', { name: 'تعديل' });
  await user.click(rows[index]);
  const modal = screen.getByText('تعديل بيانات المستخدم').closest('div.palette-modal') as HTMLElement;
  expect(modal).toBeTruthy();
  return { modal, roleTrigger: within(modal).getByRole('combobox', { name: 'الدور' }) };
}

/** Opens the role picker and returns the option labels it offers, in order. */
async function openRoleOptions(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) {
  await user.click(trigger);
  const options = await screen.findAllByRole('option');
  return options.map(o => o.textContent?.trim() ?? '');
}

beforeEach(() => {
  currentRole = 'PROGRAMMING_HEAD';
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

    const { roleTrigger } = await openEditModal(user);

    expect(roleTrigger).toHaveTextContent('طالب التذكرة');
  });

  // The labels come from ROLE_LABELS, the same source the table chips and the
  // role filter read — the picker used to spell the roles its own way.
  it('offers every assignable role', async () => {
    const user = userEvent.setup();
    renderPage();

    const { roleTrigger } = await openEditModal(user);

    expect(await openRoleOptions(user, roleTrigger)).toEqual([
      'الإدارة العليا',
      'رئيس قسم البرمجة',
      'مدير المشروع',
      'مطور',
      'مختبر QA',
      'مالك النظام',
      'طالب التذكرة',
    ]);
  });

  it('sends the newly selected role in the PATCH body', async () => {
    const user = userEvent.setup();
    renderPage();

    const { modal, roleTrigger } = await openEditModal(user);
    await user.click(roleTrigger);
    await user.click(await screen.findByRole('option', { name: 'مطور' }));
    await user.click(within(modal).getByRole('button', { name: 'حفظ التغييرات' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith(
      '/users/user-1',
      expect.objectContaining({ role: 'DEVELOPER', firstName: 'محمد', lastName: 'العلي' }),
    );
    expect(mockPatch.mock.calls[0][1]).not.toHaveProperty('id');
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
    expect(first.roleTrigger).toHaveTextContent('طالب التذكرة');
    await user.click(within(first.modal).getByRole('button', { name: 'إلغاء' }));

    const second = await openEditModal(user, 1);

    expect(second.roleTrigger).toHaveTextContent('مطور');
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

    const companies = await screen.findByText('Group Holding، Retail Co، Logistics Co');
    expect(companies).toHaveClass('truncate');
    expect(companies).toHaveAttribute('title', 'Group Holding، Retail Co، Logistics Co');

    const role = screen.getAllByText('رئيس قسم البرمجة').find(el => el.closest('td'));
    expect(role).toBeTruthy();
    expect(role!.className).toContain('whitespace-nowrap');
  });
});

describe('UsersPage — role and company filters', () => {
  const company1 = { id: 'c1', name: 'Company1' };
  const company2 = { id: 'c2', name: 'Company2' };
  const developer = {
    ...requester,
    id: 'user-2',
    firstName: 'سارة',
    lastName: 'حسن',
    email: 'dev@company.com',
    role: 'DEVELOPER',
    companies: [{ company: company2 }],
  };
  const requesterAtC1 = {
    ...requester,
    companies: [{ company: company1 }],
  };

  beforeEach(() => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/users') return Promise.resolve({ data: [requesterAtC1, developer] });
      if (url === '/companies') return Promise.resolve({ data: [company1, company2] });
      return Promise.resolve({ data: [] });
    });
  });

  it('shows only the selected role', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('محمد العلي')).toBeInTheDocument();
    expect(screen.getByText('سارة حسن')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'مطور' }));

    expect(screen.queryByText('محمد العلي')).not.toBeInTheDocument();
    expect(screen.getByText('سارة حسن')).toBeInTheDocument();
  });

  it('shows only users in the selected company', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('محمد العلي');
    await user.click(screen.getByRole('button', { name: 'Company1' }));

    expect(screen.getByText('محمد العلي')).toBeInTheDocument();
    expect(screen.queryByText('سارة حسن')).not.toBeInTheDocument();
  });

  it('narrows by role and company together', async () => {
    const user = userEvent.setup();
    const otherDev = {
      ...developer,
      id: 'user-3',
      firstName: 'خالد',
      lastName: 'عمر',
      companies: [{ company: company1 }],
    };
    mockGet.mockImplementation((url: string) => {
      if (url === '/users') return Promise.resolve({ data: [requesterAtC1, developer, otherDev] });
      if (url === '/companies') return Promise.resolve({ data: [company1, company2] });
      return Promise.resolve({ data: [] });
    });
    renderPage();

    await screen.findByText('خالد عمر');
    await user.click(screen.getByRole('button', { name: 'مطور' }));
    await user.click(screen.getByRole('button', { name: 'Company1' }));

    expect(screen.getByText('خالد عمر')).toBeInTheDocument();
    expect(screen.queryByText('محمد العلي')).not.toBeInTheDocument();
    expect(screen.queryByText('سارة حسن')).not.toBeInTheDocument();
  });

  it('restores the full list when الكل is pressed', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('محمد العلي');
    await user.click(screen.getByRole('button', { name: 'مطور' }));
    expect(screen.queryByText('محمد العلي')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'كل الأدوار' }));

    expect(screen.getByText('محمد العلي')).toBeInTheDocument();
    expect(screen.getByText('سارة حسن')).toBeInTheDocument();
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

describe('UsersPage — project manager directory', () => {
  const company1 = { id: 'c1', name: 'Company1', systems: [{ id: 's1', name: 'Project1' }] };
  const company2 = { id: 'c2', name: 'Company2', systems: [{ id: 's2', name: 'Project2' }] };
  const developerC1 = {
    id: 'dev-1',
    firstName: 'Dev',
    lastName: 'C1',
    email: 'dev1@test.com',
    role: 'DEVELOPER',
    isActive: true,
    companies: [],
    systems: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const developerC2 = {
    id: 'dev-2',
    firstName: 'Dev',
    lastName: 'C2',
    email: 'dev2@test.com',
    role: 'DEVELOPER',
    isActive: true,
    companies: [{ company: company2 }],
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    currentRole = 'PROJECT_MANAGER';
    mockGet.mockImplementation((url: string) => {
      if (url === '/users') return Promise.resolve({ data: [developerC1, developerC2] });
      if (url === '/companies') return Promise.resolve({ data: [company1] });
      return Promise.resolve({ data: [] });
    });
  });

  it('shows the dev/QA directory subtitle and stat label', async () => {
    renderPage();

    expect(await screen.findByText('دليل المطورين و QA في كل الشركات — لتعديل العضوية والإسناد فقط')).toBeInTheDocument();
    expect(await screen.findByText('إجمالي المطورين و QA')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'دعوة مستخدم' })).not.toBeInTheDocument();
  });

  it('builds company filter chips from listed users, not the PM portfolio alone', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/users') {
        return Promise.resolve({
          data: [
            { ...developerC1, companies: [{ company: company1 }] },
            developerC2,
          ],
        });
      }
      if (url === '/companies') return Promise.resolve({ data: [company1] });
      return Promise.resolve({ data: [] });
    });
    renderPage();

    await screen.findByText('Dev C1');
    expect(screen.getByRole('button', { name: 'Company1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Company2' })).toBeInTheDocument();
  });

  it('limits role filter chips to developer and QA', async () => {
    renderPage();

    await screen.findByText('Dev C1');
    expect(screen.getByRole('button', { name: 'مطور' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مختبر QA' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'طالب التذكرة' })).not.toBeInTheDocument();
  });

  async function openPmMembershipModal(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText('Dev C1');
    const buttons = await screen.findAllByText('المشاريع');
    await user.click(buttons[0]);
    return screen.getByText('تعديل مشاريع المستخدم').closest('div.palette-modal') as HTMLElement;
  }

  it('opens a membership-only edit modal for developers', async () => {
    const user = userEvent.setup();
    renderPage();

    const modal = await openPmMembershipModal(user);

    expect(within(modal).queryByLabelText('الاسم الأول')).not.toBeInTheDocument();
    expect(within(modal).queryByRole('combobox', { name: 'الدور' })).not.toBeInTheDocument();
    expect(within(modal).getByText('Company1')).toBeInTheDocument();
  });

  it('PATCHes membership without sending id in the body', async () => {
    const user = userEvent.setup();
    const saved = {
      ...developerC1,
      company: company1,
      companies: [{ company: company1 }],
      systems: [],
    };
    mockPatch.mockResolvedValue({ data: saved });
    mockGet.mockImplementation((url: string) => {
      if (url === '/users') {
        const list = mockPatch.mock.calls.length > 0
          ? [saved, developerC2]
          : [developerC1, developerC2];
        return Promise.resolve({ data: list });
      }
      if (url === '/companies') return Promise.resolve({ data: [company1] });
      return Promise.resolve({ data: [] });
    });
    renderPage();

    const modal = await openPmMembershipModal(user);
    await user.click(within(modal).getByRole('checkbox', { name: 'Company1' }));
    await user.click(within(modal).getByRole('button', { name: 'حفظ التغييرات' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/users/dev-1', {
      companyIds: ['c1'],
      systemIds: [],
    });
    await waitFor(() => {
      expect(screen.queryByText('تعديل مشاريع المستخدم')).not.toBeInTheDocument();
    });
    // Table company column updates immediately via local override.
    expect(await screen.findByRole('button', { name: 'Company1' })).toBeInTheDocument();
    expect(screen.getAllByText('Company1').length).toBeGreaterThan(0);
  });

  it('always offers بدون شركة and filters to unassigned users', async () => {
    const user = userEvent.setup();
    const unassigned = {
      ...developerC1,
      id: 'dev-free',
      firstName: 'Free',
      lastName: 'Dev',
      companies: [],
      systems: [],
      company: undefined,
    };
    mockGet.mockImplementation((url: string) => {
      if (url === '/users') return Promise.resolve({ data: [unassigned, developerC2] });
      if (url === '/companies') return Promise.resolve({ data: [company1] });
      return Promise.resolve({ data: [] });
    });
    renderPage();

    expect(await screen.findByRole('button', { name: 'بدون شركة (1)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'بدون شركة (1)' }));

    expect(screen.getByText('Free Dev')).toBeInTheDocument();
    expect(screen.queryByText('Dev C2')).not.toBeInTheDocument();
  });
});
