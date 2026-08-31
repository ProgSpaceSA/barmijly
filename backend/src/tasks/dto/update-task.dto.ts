import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  /** Manager-only in the service — reassigning someone else's work is not the assignee's call. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToId?: string;

  /** Manager-only in the service. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Estimated effort in hours. Assignees may revise this.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  estimatedHours?: number | null;

  @ApiPropertyOptional({ description: 'Difficulty 1–5, same scale as the ticket. Assignees may revise this.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficultyLevel?: number | null;

  /** Manager-only in the service — a blocker gates work that is not yours. */
  @ApiPropertyOptional({ description: 'Blocks every task below it until COMPLETED.' })
  @IsOptional()
  @IsBoolean()
  isBlocking?: boolean;
}
