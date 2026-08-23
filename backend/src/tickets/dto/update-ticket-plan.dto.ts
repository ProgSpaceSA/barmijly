import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Ticket-level schedule metadata — editable any time, separate from status moves. */
export class UpdateTicketPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledStart?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  estimatedDeadline?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedHours?: number | null;

  @ApiPropertyOptional({ description: 'Difficulty 1–5.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficultyLevel?: number | null;
}
