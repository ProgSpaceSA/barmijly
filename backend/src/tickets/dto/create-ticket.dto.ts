import {
  IsString, IsEnum, IsOptional, IsBoolean, IsUUID, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketType, Priority } from '@prisma/client';

export class CreateTicketDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedOutcome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessImpact?: string;

  @ApiProperty({ enum: TicketType })
  @IsEnum(TicketType)
  type: TicketType;

  @ApiProperty()
  @IsUUID()
  systemId: string;

  @ApiProperty()
  @IsUUID()
  companyId: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasFinancialLoss?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  financialLossDetails?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  suggestedDeadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  relatedTicketId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverImageUrl?: string;
}
