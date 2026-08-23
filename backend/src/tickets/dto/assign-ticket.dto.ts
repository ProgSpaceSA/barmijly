import {
  IsUUID, IsOptional, IsInt, IsDateString, IsBoolean, IsEnum, IsString,
  IsArray, ArrayMinSize, Min, Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Priority } from '@prisma/client';

export class AssignTicketDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Optional explicit roster. When omitted, the active working team is used.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  developerIds?: string[];

  @ApiPropertyOptional({
    description: 'Which developer owns the ticket-level transitions. Defaults to the first entry.',
  })
  @IsOptional()
  @IsUUID()
  leadDeveloperId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  estimatedHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  estimatedDeadline?: string;

  @ApiPropertyOptional({ description: 'Difficulty 1–5.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficultyLevel?: number;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  finalPriority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  needsUiUx?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  needsBackend?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  needsFrontend?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  needsTesting?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  needsDeployment?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNotes?: string;
}
