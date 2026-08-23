import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanyProjectTree } from './CompanyProjectTree';

const companies = [
  {
    id: 'c1',
    name: 'Company1',
    systems: [
      { id: 's1', name: 'Project1' },
      { id: 's2', name: 'Project2' },
    ],
  },
  {
    id: 'c2',
    name: 'Company2',
    systems: [{ id: 's3', name: 'Project3' }],
  },
];

describe('CompanyProjectTree', () => {
  it('shows only companies inside the PM portfolio when scoped', () => {
    render(
      <CompanyProjectTree
        companies={companies}
        value={{ companyIds: [], systemIds: [] }}
        onChange={() => {}}
        visibleCompanyIds={['c1']}
      />,
    );

    expect(screen.getByText('Company1')).toBeInTheDocument();
    expect(screen.queryByText('Company2')).not.toBeInTheDocument();
  });

  it('selecting a company clears per-system rows', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <CompanyProjectTree
        companies={companies}
        value={{ companyIds: [], systemIds: ['s1'] }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Company1' }));

    expect(onChange).toHaveBeenCalledWith({ companyIds: ['c1'], systemIds: [] });
  });

  it('expands projects and toggles a single system', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <CompanyProjectTree
        companies={companies}
        value={{ companyIds: [], systemIds: [] }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getAllByRole('button', { expanded: false })[0]);
    await user.click(screen.getByRole('checkbox', { name: 'Project1' }));

    expect(onChange).toHaveBeenCalledWith({ companyIds: [], systemIds: ['s1'] });
  });
});
