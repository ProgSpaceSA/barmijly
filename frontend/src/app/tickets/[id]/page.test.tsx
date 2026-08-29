import { Suspense } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    post: vi.fn(),
    delete: (...args: unknown[]) => mockDelete(...args),
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
  estimatedDeadline: '2026-08-26T00:00:00.000Z',
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
  mockDelete.mockReset();
  mockDelete.mockResolvedValue({ data: {} });
  mockGet.mockImplementation((url: unknown) => {
    const path = String(url);
    if (path.startsWith('/tickets/ticket-1/tasks')) return Promise.resolve({ data: [] });
    if (path.startsWith('/tickets/ticket-1/assignees')) {
      return Promise.resolve({
        data: [{ developerId: 'dev-1', isLead: true, developer: { id: 'dev-1', firstName: 'أحمد', lastName: 'علي' } }],
      });
    }
    if (path.startsWith('/tickets/ticket-1')) return Promise.resolve({ data: ticket });
    if (path === '/users/mentionable') return Promise.resolve({ data: [] });
    if (path.startsWith('/systems/')) return Promise.resolve({ data: { id: 'sys-1' } });
    return Promise.resolve({ data: [] });
  });
});

describe('TicketDetailPage — promoted from the backlog', () => {
  it('links back to the requirement in the hero and under the requester in the sidebar', async () => {
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets/ticket-1/tasks')) return Promise.resolve({ data: [] });
      if (path.startsWith('/tickets/ticket-1/assignees')) return Promise.resolve({ data: [] });
      if (path.startsWith('/tickets/ticket-1')) {
        return Promise.resolve({
          data: {
            ...ticket,
            requirement: { id: 'req-1', requirementNumber: 4, title: 'تقرير مبيعات', status: 'CONVERTED' },
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    await renderPage();

    const codes = await screen.findAllByText('REQ-0004');
    expect(codes).toHaveLength(2);
    for (const code of codes) {
      expect(code.closest('a')).toHaveAttribute('href', '/requirements/req-1');
    }

    const sidebar = document.getElementById('ticket-sidebar')!;
    const requester = screen.getByLabelText('طالب التذكرة');
    const requirement = within(sidebar).getByLabelText('المتطلب');
    const createdAt = within(sidebar).getByLabelText('تاريخ الإنشاء');
    const following = Node.DOCUMENT_POSITION_FOLLOWING;

    expect(within(sidebar).queryByText('تقرير مبيعات')).toBeNull();
    expect(requester.compareDocumentPosition(requirement) & following).not.toBe(0);
    expect(requirement.compareDocumentPosition(createdAt) & following).not.toBe(0);
  });

  it('shows no requirement chip on an ordinary ticket', async () => {
    await renderPage();
    await screen.findByText('تعديل قالب الفاتورة');

    expect(screen.queryByText(/^REQ-/)).toBeNull();
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

  it('shows company and project on separate sidebar rows, with plan fields after ticket metadata', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'تعديل قالب الفاتورة' })).toBeInTheDocument();
    });

    const companies = screen.getAllByLabelText('الشركة');
    const projects = screen.getAllByLabelText('النظام');
    const dueDate = screen.getByLabelText('تاريخ التسليم المتوقع');
    const requester = screen.getByLabelText('طالب التذكرة');
    const createdAt = screen.getByLabelText('تاريخ الإنشاء');
    const status = screen.getByText('معتمدة');

    expect(companies).toHaveLength(2);
    expect(projects).toHaveLength(2);

    const [heroCompany, sidebarCompany] = companies;
    const [heroProject, sidebarProject] = projects;
    const following = Node.DOCUMENT_POSITION_FOLLOWING;

    expect(heroCompany.compareDocumentPosition(heroProject) & following).not.toBe(0);
    expect(heroProject.compareDocumentPosition(status) & following).not.toBe(0);
    expect(sidebarCompany.compareDocumentPosition(sidebarProject) & following).not.toBe(0);
    expect(requester.compareDocumentPosition(createdAt) & following).not.toBe(0);
    expect(createdAt.compareDocumentPosition(dueDate) & following).not.toBe(0);
    expect(dueDate).toHaveAttribute('type', 'date');
  });

  it('toggles the details sidebar from a single fixed control', async () => {
    const user = userEvent.setup();
    await renderPage();

    const toggle = await screen.findByRole('button', { name: 'إخفاء' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'ticket-sidebar');

    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'عرض التفاصيل' })).toBe(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'إخفاء' })).toBe(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows assigned-to-me label on tasks assigned to the current user', async () => {
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets/ticket-1/tasks')) {
        return Promise.resolve({
          data: [
            {
              id: 'task-mine',
              title: 'مهمتي',
              status: 'NEW',
              assignedTo: { id: 'user-1', firstName: 'ف', lastName: 'ل' },
              createdBy: { id: 'user-1', firstName: 'ف', lastName: 'ل' },
              attachments: [],
            },
            {
              id: 'task-other',
              title: 'مهمة زميل',
              status: 'NEW',
              assignedTo: { id: 'dev-1', firstName: 'أحمد', lastName: 'علي' },
              createdBy: { id: 'user-1', firstName: 'ف', lastName: 'ل' },
              attachments: [],
            },
          ],
        });
      }
      if (path.startsWith('/tickets/ticket-1/assignees')) {
        return Promise.resolve({ data: [] });
      }
      if (path.startsWith('/tickets/ticket-1')) return Promise.resolve({ data: ticket });
      if (path === '/users/mentionable') return Promise.resolve({ data: [] });
      if (path.startsWith('/systems/')) return Promise.resolve({ data: { id: 'sys-1' } });
      return Promise.resolve({ data: [] });
    });

    await renderPage();

    expect(await screen.findByText('مهمتي')).toBeInTheDocument();
    expect(screen.getByText('مهمة زميل')).toBeInTheDocument();
    expect(screen.getAllByText('مُكلف بها')).toHaveLength(1);
    const mineRow = screen.getByText('مهمتي').closest('div.rounded-xl') as HTMLElement;
    expect(mineRow).toHaveStyle({ border: '1px solid rgba(79, 70, 229, 0.35)' });
    expect(within(mineRow).getByText('مُكلف بها')).toBeInTheDocument();
    expect(within(mineRow).getByLabelText('أنشأها').closest('p')).toHaveTextContent('ف ل');
  });

  it('shows remaining days beside each open task', async () => {
    const due = new Date();
    due.setHours(12, 0, 0, 0);
    due.setDate(due.getDate() + 5);
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets/ticket-1/tasks')) {
        return Promise.resolve({
          data: [{
            id: 'task-1',
            title: 'ضبط قالب الفاتورة',
            status: 'IN_PROGRESS',
            dueDate: due.toISOString(),
            assignedTo: { id: 'dev-1', firstName: 'أحمد', lastName: 'علي' },
            attachments: [],
          }],
        });
      }
      if (path.startsWith('/tickets/ticket-1/assignees')) {
        return Promise.resolve({ data: [] });
      }
      if (path.startsWith('/tickets/ticket-1')) return Promise.resolve({ data: ticket });
      if (path === '/users/mentionable') return Promise.resolve({ data: [] });
      if (path.startsWith('/systems/')) return Promise.resolve({ data: { id: 'sys-1' } });
      return Promise.resolve({ data: [] });
    });

    await renderPage();

    expect(await screen.findByText('ضبط قالب الفاتورة')).toBeInTheDocument();
    expect(screen.getByLabelText('المتبقي')).toHaveTextContent('متبقي 5 أيام');
  });

  it('shows task creator and completion date on finished tasks', async () => {
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets/ticket-1/tasks')) {
        return Promise.resolve({
          data: [{
            id: 'task-1',
            title: 'ضبط قالب الفاتورة',
            status: 'COMPLETED',
            createdAt: '2026-08-18T10:00:00.000Z',
            completedAt: '2026-08-20T14:00:00.000Z',
            assignedTo: { id: 'dev-1', firstName: 'أحمد', lastName: 'علي' },
            createdBy: { id: 'head-1', firstName: 'سارة', lastName: 'حسن' },
            attachments: [],
          }],
        });
      }
      if (path.startsWith('/tickets/ticket-1/assignees')) {
        return Promise.resolve({ data: [] });
      }
      if (path.startsWith('/tickets/ticket-1')) return Promise.resolve({ data: ticket });
      if (path === '/users/mentionable') return Promise.resolve({ data: [] });
      if (path.startsWith('/systems/')) return Promise.resolve({ data: { id: 'sys-1' } });
      return Promise.resolve({ data: [] });
    });

    await renderPage();

    expect(await screen.findByText('ضبط قالب الفاتورة')).toBeInTheDocument();
    const createdLine = screen.getByLabelText('أنشأها').closest('p');
    expect(createdLine).toHaveTextContent('سارة حسن');
    expect(createdLine).toHaveTextContent(/18 أغسطس/);
    const finishedLine = screen.getByLabelText('أنجزها').closest('p');
    expect(finishedLine).toHaveTextContent('أحمد علي');
    expect(finishedLine).toHaveTextContent(/20 أغسطس/);
  });

  it('shows ticket completion date in the sidebar when set', async () => {
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets/ticket-1/tasks')) return Promise.resolve({ data: [] });
      if (path.startsWith('/tickets/ticket-1')) {
        return Promise.resolve({
          data: { ...ticket, status: 'COMPLETED', completedAt: '2026-08-20T16:00:00.000Z' },
        });
      }
      if (path === '/users/mentionable') return Promise.resolve({ data: [] });
      if (path.startsWith('/systems/')) return Promise.resolve({ data: { id: 'sys-1' } });
      return Promise.resolve({ data: [] });
    });

    await renderPage();

    expect(await screen.findByLabelText('تاريخ الإكمال')).toBeInTheDocument();
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

  it('asks before deleting a task, then removes it', async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets/ticket-1/tasks')) {
        return Promise.resolve({
          data: [{
            id: 'task-1',
            title: 'ضبط قالب الفاتورة',
            status: 'IN_PROGRESS',
            assignedTo: { id: 'dev-1', firstName: 'أحمد', lastName: 'علي' },
            attachments: [],
          }],
        });
      }
      if (path.startsWith('/tickets/ticket-1/assignees')) {
        return Promise.resolve({ data: [] });
      }
      if (path.startsWith('/tickets/ticket-1')) return Promise.resolve({ data: ticket });
      if (path === '/users/mentionable') return Promise.resolve({ data: [] });
      if (path.startsWith('/systems/')) return Promise.resolve({ data: { id: 'sys-1' } });
      return Promise.resolve({ data: [] });
    });

    await renderPage();

    await user.click(await screen.findByRole('button', { name: 'حذف المهمة' }));
    expect(mockDelete).not.toHaveBeenCalled();

    const modal = screen.getByText('هل أنت متأكد من حذف هذه المهمة؟').closest('div.palette-modal') as HTMLElement;
    expect(modal).toBeTruthy();
    expect(within(modal).getByText('ضبط قالب الفاتورة')).toBeInTheDocument();

    await user.click(within(modal).getByRole('button', { name: 'حذف' }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/tasks/task-1');
    });
  });

  it('closes the task delete modal without calling the API', async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets/ticket-1/tasks')) {
        return Promise.resolve({
          data: [{
            id: 'task-1',
            title: 'ضبط قالب الفاتورة',
            status: 'NEW',
            assignedTo: { id: 'dev-1', firstName: 'أحمد', lastName: 'علي' },
            attachments: [],
          }],
        });
      }
      if (path.startsWith('/tickets/ticket-1/assignees')) {
        return Promise.resolve({ data: [] });
      }
      if (path.startsWith('/tickets/ticket-1')) return Promise.resolve({ data: ticket });
      if (path === '/users/mentionable') return Promise.resolve({ data: [] });
      if (path.startsWith('/systems/')) return Promise.resolve({ data: { id: 'sys-1' } });
      return Promise.resolve({ data: [] });
    });

    await renderPage();

    await user.click(await screen.findByRole('button', { name: 'حذف المهمة' }));
    const modal = screen.getByText('هل أنت متأكد من حذف هذه المهمة؟').closest('div.palette-modal') as HTMLElement;
    await user.click(within(modal).getByRole('button', { name: 'إلغاء' }));

    expect(screen.queryByText('هل أنت متأكد من حذف هذه المهمة؟')).not.toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('asks before changing status, then applies it', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole('button', { name: /تغيير الحالة يدوياً/ }));
    await user.click(await screen.findByRole('button', { name: 'قيد التنفيذ' }));

    expect(mockPatch.mock.calls.some((c) => String(c[0]).includes('force-status'))).toBe(false);

    const modal = screen.getByText('هل أنت متأكد من تغيير حالة التذكرة؟').closest('div.palette-modal') as HTMLElement;
    expect(modal).toBeTruthy();
    expect(within(modal).getByText(/معتمدة/)).toBeInTheDocument();
    expect(within(modal).getByText(/قيد التنفيذ/)).toBeInTheDocument();

    await user.click(within(modal).getByRole('button', { name: 'تأكيد' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        '/tickets/ticket-1/force-status',
        expect.objectContaining({ status: 'IN_PROGRESS' }),
      );
    });
  });

  it('closes the status change modal without calling the API', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole('button', { name: /تغيير الحالة يدوياً/ }));
    await user.click(await screen.findByRole('button', { name: 'قيد التنفيذ' }));
    const modal = screen.getByText('هل أنت متأكد من تغيير حالة التذكرة؟').closest('div.palette-modal') as HTMLElement;
    await user.click(within(modal).getByRole('button', { name: 'إلغاء' }));

    expect(screen.queryByText('هل أنت متأكد من تغيير حالة التذكرة؟')).not.toBeInTheDocument();
    expect(mockPatch.mock.calls.some((c) => String(c[0]).includes('force-status'))).toBe(false);
  });

  it('asks before archiving, then archives', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole('button', { name: 'أرشفة' }));
    expect(mockPatch.mock.calls.some((c) => String(c[0]).includes('/archive'))).toBe(false);

    const modal = screen.getByText('هل أنت متأكد من أرشفة هذه التذكرة؟').closest('div.palette-modal') as HTMLElement;
    expect(modal).toBeTruthy();

    await user.click(within(modal).getByRole('button', { name: 'تأكيد' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/tickets/ticket-1/archive');
    });
  });

  it('asks before scheduling once the plan and team are ready', async () => {
    const user = userEvent.setup();
    const approvedWithPlan = {
      ...ticket,
      estimatedDeadline: '2026-08-28T00:00:00.000Z',
    };
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.startsWith('/tickets/ticket-1/tasks')) return Promise.resolve({ data: [] });
      if (path.startsWith('/tickets/ticket-1/assignees')) {
        return Promise.resolve({
          data: [{ developerId: 'dev-1', isLead: true, developer: { id: 'dev-1', firstName: 'أحمد', lastName: 'علي' } }],
        });
      }
      if (path.startsWith('/tickets/ticket-1')) return Promise.resolve({ data: approvedWithPlan });
      if (path === '/users/mentionable') return Promise.resolve({ data: [] });
      if (path.startsWith('/systems/')) return Promise.resolve({ data: { id: 'sys-1' } });
      return Promise.resolve({ data: [] });
    });

    await renderPage();

    await user.click(await screen.findByRole('button', { name: 'جدولة' }));
    expect(mockPatch.mock.calls.some((c) => String(c[0]).includes('/assign'))).toBe(false);

    const modal = screen.getByText('هل أنت متأكد من جدولة هذه التذكرة؟').closest('div.palette-modal') as HTMLElement;
    await user.click(within(modal).getByRole('button', { name: 'تأكيد' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/tickets/ticket-1/assign', {});
    });
  });
});
