import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EstimateChip } from './EstimateChip';
import { DIFFICULTY_LABELS, ESTIMATE_LABELS } from '@/lib/constants';

describe('EstimateChip', () => {
  it('shows the estimate on its own before any work is logged', () => {
    render(<EstimateChip hours={6} />);

    expect(screen.getByTitle(ESTIMATE_LABELS.hours)).toHaveTextContent('6 س');
  });

  it('reads actual against estimate once both are known', () => {
    render(<EstimateChip hours={6} actual={4.5} />);

    expect(screen.getByTitle(ESTIMATE_LABELS.hours)).toHaveTextContent('4.5 س / 6 س');
  });

  it('shows actual alone when nobody estimated', () => {
    render(<EstimateChip actual={2} />);

    expect(screen.getByTitle(ESTIMATE_LABELS.actual)).toHaveTextContent('2 س');
  });

  it('names the difficulty rather than printing a bare number', () => {
    render(<EstimateChip difficulty={4} />);

    expect(screen.getByTitle(ESTIMATE_LABELS.difficulty)).toHaveTextContent(DIFFICULTY_LABELS[4]);
  });

  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<EstimateChip />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows estimate alone when actual time rounds to zero', () => {
    render(<EstimateChip hours={10} actual={0} />);

    expect(screen.getByTitle(ESTIMATE_LABELS.hours)).toHaveTextContent('10 س');
    expect(screen.queryByText(/0 س \/ 10 س/)).not.toBeInTheDocument();
  });

  it('treats a zero estimate as a real value, not a missing one', () => {
    render(<EstimateChip hours={0} />);

    expect(screen.getByTitle(ESTIMATE_LABELS.hours)).toHaveTextContent('0 س');
  });
});
