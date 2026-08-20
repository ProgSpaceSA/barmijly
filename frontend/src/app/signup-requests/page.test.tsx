import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

import SignupRequestsPage from './page';

const pending = {
  id: 'req-1',
  firstName: 'نورة',
  lastName: 'العنزي',
  email: 'noura@company.com',
  status: 'PENDING',
  createdAt: '2026-08-19T00:00:00.000Z',
};

const approved = {
  id: 'req-2',
  firstName: 'فهد',
  lastName: 'الشمري',
  email: 'fahd@company.com',
  status: 'APPROVED',
  createdAt: '2026-08-18T00:00:00.000Z',
  reviewedBy: { firstName: 'ناصر', lastName: 'القحطاني' },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SignupRequestsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGet.mockImplementation((url: string) => {
    if (url === '/signup-requests') return Promise.resolve({ data: [pending, approved] });
    return Promise.resolve({ data: [] });
  });
  mockPatch.mockResolvedValue({ data: {} });
});

describe('SignupRequestsPage', () => {
  it('lists pending requests by default with a circular count badge', async () => {
    renderPage();

    expect(await screen.findByText('نورة العنزي')).toBeInTheDocument();
    expect(screen.getByText('noura@company.com')).toBeInTheDocument();
    expect(screen.queryByText('فهد الشمري')).not.toBeInTheDocument();

    const badge = screen.getByTestId('pending-count');
    expect(badge).toHaveTextContent('1');
    expect(badge).toHaveStyle({ width: '20px', height: '20px' });
  });

  it('shows approved requests when that filter is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('نورة العنزي');
    await user.click(screen.getByRole('button', { name: /مُعتمد/ }));

    expect(await screen.findByText('فهد الشمري')).toBeInTheDocument();
    expect(screen.queryByText('نورة العنزي')).not.toBeInTheDocument();
    expect(screen.getByText(/بواسطة ناصر القحطاني/)).toBeInTheDocument();
  });

  it('approves a pending request', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'اعتماد' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/signup-requests/req-1/approve');
    });
  });

  it('rejects a pending request after the confirmation modal', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'رفض' }));
    expect(mockPatch).not.toHaveBeenCalled();

    const modal = screen.getByText('رفض طلب التسجيل').closest('div.palette-modal') as HTMLElement;
    expect(modal).toBeTruthy();
    expect(within(modal).getByText('هل تريد رفض طلب التسجيل؟')).toBeInTheDocument();
    expect(within(modal).getByText('noura@company.com')).toBeInTheDocument();

    await user.click(within(modal).getByRole('button', { name: 'رفض الطلب' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/signup-requests/req-1/reject');
    });
  });

  it('closes the reject modal without calling the API', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'رفض' }));
    const modal = screen.getByText('رفض طلب التسجيل').closest('div.palette-modal') as HTMLElement;
    await user.click(within(modal).getByRole('button', { name: 'إلغاء' }));

    expect(screen.queryByText('رفض طلب التسجيل')).not.toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('shows an empty state when there are no pending requests', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/signup-requests') return Promise.resolve({ data: [approved] });
      return Promise.resolve({ data: [] });
    });

    renderPage();

    expect(await screen.findByText(/لا توجد طلبات بانتظار المراجعة/)).toBeInTheDocument();
  });
});
