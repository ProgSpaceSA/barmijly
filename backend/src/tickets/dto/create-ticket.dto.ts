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

  @ApiProperty()
  @IsString()
  reason: string;

  @ApiProperty()
  @IsString()
  expectedOutcome: string;

  @ApiProperty()
  @IsString()
  businessImpact: string;

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
}
