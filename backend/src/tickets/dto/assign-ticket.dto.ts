import { IsUUID, IsOptional, IsInt, IsDateString, IsBoolean, IsEnum, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority } from '@prisma/client';

export class AssignTicketDto {
  @ApiProperty()
  @IsUUID()
  developerId: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
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
