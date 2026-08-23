import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { TicketListCard } from './TicketListCard';

const ticket = {
  id: 'ticket-1',
  title: 'تعديل قالب الفاتورة',
  status: 'CLOSED',
  type: 'MODIFICATION',
  ticketNumber: 29,
  priority: 'LOW',
  finalPriority: 'LOW',
  estimatedDeadline: '2026-08-18T00:00:00.000Z',
  createdAt: '2026-08-19T00:00:00.000Z',
  creator: { id: 'c1', firstName: 'راشد', lastName: 'الدوسري' },
  system: { name: 'POS' },
  company: { id: 'co1', name: 'Retail Co' },
  assignments: [{ developer: { firstName: 'ديمة', lastName: 'الحربي' } }],
};

describe('TicketListCard', () => {
  it('shows requester, system, company, delivery, and created-at tooltips', () => {
    render(<TicketListCard ticket={ticket} />);

    const due = `التسليم: ${format(new Date(ticket.estimatedDeadline), 'd MMM yyyy', { locale: ar })}`;
    expect(screen.getByTitle('طالب التذكرة')).toHaveTextContent('راشد الدوسري');
    expect(screen.getByTitle('النظام')).toHaveTextContent('POS');
    expect(screen.getByTitle('الشركة')).toHaveTextContent('Retail Co');
    expect(screen.getByTitle('تاريخ التسليم المتوقع')).toHaveTextContent(due);
    expect(screen.getByTitle(/^تاريخ الإنشاء/)).toBeInTheDocument();
    expect(screen.getByTitle('المطور المُكلَّف: ديمة الحربي')).toHaveAttribute(
      'aria-label',
      'المطور المُكلَّف: ديمة الحربي',
    );
  });

  // A long title cut to one ellipsised line names nothing the reader can act
  // on when the card is the width of a phone. `.brm-row-title` wraps below the
  // breakpoint and only falls back to an ellipsis on a wide screen.
  it('lets a long title wrap instead of truncating it', () => {
    const long = { ...ticket, title: '[NEW][C1/P1] تذكرة أنشأها TicketRequesterP1 لتعديل شاشة الفواتير' };
    render(<TicketListCard ticket={long} />);

    const heading = screen.getByRole('heading', { name: long.title });
    expect(heading).toHaveClass('brm-row-title');
    expect(heading).not.toHaveClass('truncate');
  });

  it('marks archived tickets without dropping the list-card tooltips', () => {
    render(<TicketListCard ticket={ticket} archived />);

    expect(screen.getByText('مؤرشفة')).toBeInTheDocument();
    expect(screen.getByTitle('طالب التذكرة')).toBeInTheDocument();
    expect(screen.getByTitle('النظام')).toBeInTheDocument();
    expect(screen.getByTitle('الشركة')).toBeInTheDocument();
    expect(screen.getByTitle('تاريخ التسليم المتوقع')).toBeInTheDocument();
    expect(screen.getByTitle(/^تاريخ الإنشاء/)).toBeInTheDocument();
  });
});
