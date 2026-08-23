import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentItem } from './CommentItem';
import type { MentionUser } from '@/lib/mentions';

vi.mock('@/lib/attachments', () => ({
  attachmentPath: (id: string) => `/attachments/${id}/file`,
  fetchAttachmentObjectUrl: vi.fn().mockResolvedValue('blob:preview'),
  downloadAttachment: vi.fn().mockResolvedValue(undefined),
}));

const sara: MentionUser = {
  id: 'u2', firstName: 'Sara', lastName: 'Khan', email: 'sara@brm.sa', role: 'QA',
};
const users = [sara];

const baseComment = {
  id: 'c1',
  content: 'الرجاء المراجعة',
  visibility: 'PUBLIC',
  mentions: [] as string[],
  createdAt: '2026-08-19T10:00:00.000Z',
  updatedAt: '2026-08-19T10:00:00.000Z',
  attachments: [] as any[],
  author: { id: 'dev-1', firstName: 'أحمد', lastName: 'علي', role: 'DEVELOPER' },
};

function renderItem(overrides: Record<string, any> = {}, props: Record<string, any> = {}) {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const onStartEdit = vi.fn();
  render(
    <CommentItem
      comment={{ ...baseComment, ...overrides }}
      users={users}
      currentUserId="dev-1"
      editing={false}
      onStartEdit={onStartEdit}
      onCancelEdit={vi.fn()}
      onSubmitEdit={vi.fn()}
      onDelete={onDelete}
      onOpenImage={vi.fn()}
      {...props}
    />,
  );
  return { onDelete, onStartEdit };
}

describe('CommentItem', () => {
  it('badges the author with their role', () => {
    renderItem({}, { currentUserId: 'someone-else' });
    expect(screen.getByText('مطور')).toBeInTheDocument();
    expect(screen.getByText('أحمد علي')).toBeInTheDocument();
  });

  it('shows the author name with a you badge when the viewer wrote it', () => {
    renderItem();
    expect(screen.getByText('أحمد علي')).toBeInTheDocument();
    expect(screen.getByText('أنت')).toBeInTheDocument();
  });

  it('paints a mention inside the body and isolates it from the Arabic around it', () => {
    const { container } = render(
      <CommentItem
        comment={{ ...baseComment, content: 'شكراً @Sara Khan على المراجعة' }}
        users={users}
        currentUserId="dev-1"
        editing={false}
        onStartEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenImage={vi.fn()}
        />,
    );

    const mention = container.querySelector('.brm-mention');
    expect(mention?.tagName).toBe('BDI');
    expect(mention).toHaveAttribute('dir', 'rtl');
    expect(mention).toHaveTextContent('@Sara Khan');
    expect(container.querySelector('.brm-comment-body')).toHaveAttribute('dir', 'rtl');
  });

  it('marks a body as edited only once updatedAt moves past the write', () => {
    renderItem({ updatedAt: '2026-08-19T11:00:00.000Z' });
    expect(screen.getByText(/مُعدَّل/)).toBeInTheDocument();
  });

  it('offers edit and delete to the author', () => {
    renderItem();
    expect(screen.getByRole('button', { name: 'تعديل' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف' })).toBeInTheDocument();
  });

  it('offers neither to a bystander', () => {
    renderItem({}, { currentUserId: 'other-1' });
    expect(screen.queryByRole('button', { name: 'تعديل' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف' })).not.toBeInTheDocument();
  });

  it('offers nothing to a manager either — a comment belongs to its author', () => {
    renderItem({}, { currentUserId: 'head-1' });
    expect(screen.queryByRole('button', { name: 'تعديل' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف' })).not.toBeInTheDocument();
  });

  it('confirms before deleting', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderItem();

    await user.click(screen.getByRole('button', { name: 'حذف' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('حذف التعليق نهائياً؟')).toBeInTheDocument();
    expect(document.querySelector('.brm-comment-confirm')).toBeInTheDocument();
    expect(document.querySelector('.brm-comment-body')?.textContent).toContain('الرجاء المراجعة');

    await user.click(screen.getByRole('button', { name: /^حذف$/ }));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it('flags an internal comment and one that names the viewer', () => {
    const { container } = render(
      <CommentItem
        comment={{ ...baseComment, visibility: 'INTERNAL', mentions: ['qa-1'] }}
        users={users}
        currentUserId="qa-1"
        editing={false}
        onStartEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenImage={vi.fn()}
        />,
    );

    expect(screen.getByText('داخلي')).toBeInTheDocument();
    expect(screen.getByText('ذُكرت هنا')).toBeInTheDocument();
    expect(container.querySelector('.brm-comment-mentioned')).toBeInTheDocument();
  });

  it('opens edit in the comment direction, not the last new-comment choice', async () => {
    window.localStorage.setItem('brm-editor-dir', 'ltr');
    renderItem({}, { editing: true });
    expect(screen.getByRole('textbox')).toHaveAttribute('dir', 'rtl');
    window.localStorage.clear();
  });

  it('keeps an explicit RTL mark even when the first words are English', () => {
    const { container } = render(
      <CommentItem
        comment={{ ...baseComment, content: '\u200FTest the commenting @Sara Khan' }}
        users={users}
        currentUserId="dev-1"
        editing={false}
        onStartEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenImage={vi.fn()}
      />,
    );
    expect(container.querySelector('.brm-comment-body')).toHaveAttribute('dir', 'rtl');
    expect(container.querySelector('.brm-mention')).toHaveAttribute('dir', 'rtl');
  });
});
