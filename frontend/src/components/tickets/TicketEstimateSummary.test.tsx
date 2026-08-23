import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TicketEstimateSummary } from './TicketEstimateSummary';
import { ESTIMATE_LABELS } from '@/lib/constants';

describe('TicketEstimateSummary', () => {
  it('shows plan and task rollups separately when both exist', () => {
    render(
      <TicketEstimateSummary
        ticket={{
          estimatedHours: 50,
          difficultyLevel: 1,
          tasksEstimatedHours: 105,
          effectiveDifficultyLevel: 3,
          openTaskCount: 2,
        }}
      />,
    );

    expect(screen.getByText(ESTIMATE_LABELS.fromPlan)).toBeInTheDocument();
    expect(screen.getByText(ESTIMATE_LABELS.fromTasks)).toBeInTheDocument();
    expect(screen.getByText('50 س')).toBeInTheDocument();
    expect(screen.getByText('105 س')).toBeInTheDocument();
    expect(screen.getByText(ESTIMATE_LABELS.tasksOverride)).toBeInTheDocument();
  });

  it('shows only the plan when there are no task estimates', () => {
    render(
      <TicketEstimateSummary ticket={{ estimatedHours: 8, difficultyLevel: 2 }} />,
    );

    expect(screen.getByText(ESTIMATE_LABELS.fromPlan)).toBeInTheDocument();
    expect(screen.queryByText(ESTIMATE_LABELS.fromTasks)).not.toBeInTheDocument();
  });
});
