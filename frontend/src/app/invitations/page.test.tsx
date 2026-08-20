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

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import InvitationsPage from './page';

const pending = {
  id: 'inv-1',
  email: 'badr@company.com',
  role: 'DEVELOPER',
  status: 'PENDING',
  expiresAt: '2026-08-21T00:00:00.000Z',
  createdAt: '2026-08-19T00:00:00.000Z',
  sender: { firstName: 'هاني', lastName: 'المطيري' },
  receiver: { firstName: 'بدر', lastName: 'الشمري' },
};

const accepted = {
  id: 'inv-2',
  email: 'joud@company.com',
  role: 'QA',
  status: 'ACCEPTED',
  expiresAt: '2026-08-18T00:00:00.000Z',
  createdAt: '2026-08-17T00:00:00.000Z',
  sender: { firstName: 'هاني', lastName: 'المطيري' },
  receiver: { firstName: 'جود', lastName: 'العنزي' },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InvitationsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGet.mockImplementation((url: string) => {
    if (url === '/invitations') return Promise.resolve({ data: [pending, accepted] });
    return Promise.resolve({ data: [] });
  });
  mockPatch.mockResolvedValue({ data: {} });
});

describe('InvitationsPage', () => {
  it('lists pending invitations by default with a circular count badge', async () => {
    renderPage();

    expect(await screen.findByText('بدر الشمري')).toBeInTheDocument();
    expect(screen.getByText('badr@company.com')).toBeInTheDocument();
    expect(screen.queryByText('جود العنزي')).not.toBeInTheDocument();

    const badge = screen.getByTestId('pending-count');
    expect(badge).toHaveTextContent('1');
    expect(badge).toHaveStyle({ width: '20px', height: '20px' });
  });

  it('shows accepted invitations when that filter is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('بدر الشمري');
    await user.click(screen.getByRole('button', { name: /مقبولة/ }));

    expect(await screen.findByText('جود العنزي')).toBeInTheDocument();
    expect(screen.queryByText('بدر الشمري')).not.toBeInTheDocument();
  });

  it('resends a pending invitation', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'إعادة إرسال' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/invitations/inv-1/resend');
    });
  });

  it('revokes a pending invitation after the confirmation modal', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'إلغاء' }));
    expect(mockPatch).not.toHaveBeenCalled();

    const modal = screen.getByText('إلغاء الدعوة').closest('div.palette-modal') as HTMLElement;
    expect(modal).toBeTruthy();
    expect(within(modal).getByText('هل تريد إلغاء هذه الدعوة؟')).toBeInTheDocument();

    await user.click(within(modal).getByRole('button', { name: 'تأكيد الإلغاء' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/invitations/inv-1/revoke');
    });
  });

  it('shows an empty state when there are no pending invitations', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/invitations') return Promise.resolve({ data: [accepted] });
      return Promise.resolve({ data: [] });
    });

    renderPage();

    expect(await screen.findByText(/لا توجد دعوات معلقة/)).toBeInTheDocument();
  });
});
