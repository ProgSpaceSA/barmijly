import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockPost, mockGet, mockSetAuth, mockReplace, mockToast } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGet: vi.fn(),
  mockSetAuth: vi.fn(),
  mockReplace: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/api', () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: (selector?: (s: { setAuth: typeof mockSetAuth }) => unknown) => {
    const state = { setAuth: mockSetAuth };
    return selector ? selector(state) : state;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: mockToast,
}));

import LoginPage from './page';

async function fillLogin(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText('name@company.com'), email);
  await user.type(screen.getByLabelText('كلمة المرور'), password);
  return user;
}

describe('LoginPage — password field', () => {
  it('is left-to-right so a trailing ! stays at the end when shown', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const input = screen.getByLabelText('كلمة المرور');
    expect(input).toHaveAttribute('dir', 'ltr');

    await user.type(input, 'asdfasdf0!');
    await user.click(screen.getByRole('button', { name: 'إظهار كلمة المرور' }));

    expect(input).toHaveValue('asdfasdf0!');
  });
});

describe('LoginPage — failed login', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset();
    mockSetAuth.mockReset();
    mockReplace.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
  });

  it('prevents the native form submit so the page does not reload', async () => {
    mockPost.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Invalid credentials' } },
    });
    render(<LoginPage />);
    await fillLogin('qa.requester@barmijly.ai', 'wrongpass');

    const form = screen.getByRole('button', { name: /دخول/ }).closest('form');
    expect(form).toBeTruthy();
    const submitted = fireEvent.submit(form!);
    expect(submitted).toBe(false);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalled();
    });
  });

  it('keeps the form and shows an error instead of navigating away', async () => {
    mockPost.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Invalid credentials' } },
    });
    render(<LoginPage />);
    const user = await fillLogin('qa.requester@barmijly.ai', 'wrongpass');
    await user.click(screen.getByRole('button', { name: /دخول/ }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('بيانات الدخول غير صحيحة');
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('name@company.com')).toHaveValue('qa.requester@barmijly.ai');
    expect(screen.getByLabelText('كلمة المرور')).toHaveValue('wrongpass');
  });
});
