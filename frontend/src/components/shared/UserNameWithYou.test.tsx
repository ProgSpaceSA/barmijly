import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserNameWithYou } from './UserNameWithYou';
import { COMMENT_LABELS } from '@/lib/constants';

describe('UserNameWithYou', () => {
  it('shows only the name for someone else', () => {
    render(
      <UserNameWithYou
        person={{ id: 'u2', firstName: 'سارة', lastName: 'حسن' }}
        currentUserId="u1"
      />,
    );

    expect(screen.getByText('سارة حسن')).toBeInTheDocument();
    expect(screen.queryByText(COMMENT_LABELS.you)).not.toBeInTheDocument();
  });

  it('shows the name and a you badge for the viewer', () => {
    render(
      <UserNameWithYou
        person={{ id: 'u1', firstName: 'DeveloperC12', lastName: 'Company12' }}
        currentUserId="u1"
      />,
    );

    expect(screen.getByText('DeveloperC12 Company12')).toBeInTheDocument();
    expect(screen.getByText(COMMENT_LABELS.you)).toBeInTheDocument();
  });
});
