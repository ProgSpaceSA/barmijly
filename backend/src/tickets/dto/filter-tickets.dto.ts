import { IsOptional, IsEnum, IsUUID, IsString, IsBoolean, IsArray, ArrayMaxSize } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketStatus, TicketType, Priority } from '@prisma/client';
import { Transform } from 'class-transformer';

function splitStatuses({ value }: { value: unknown }): TicketStatus[] | undefined {
  if (value == null || value === '') return undefined;
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const parts = raw
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  return parts.length ? [...new Set(parts)] as TicketStatus[] : undefined;
}

export class FilterTicketsDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({
    enum: TicketStatus,
    isArray: true,
    description: 'Comma-separated TicketStatus values (e.g. NEW,AWAITING_APPROVAL). Ignored when overdue=true.',
  })
  @IsOptional()
  @Transform(splitStatuses)
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(TicketStatus, { each: true })
  statuses?: TicketStatus[];

  @ApiPropertyOptional({ enum: TicketType })
  @IsOptional()
  @IsEnum(TicketType)
  type?: TicketType;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  systemId?: string;

  @ApiPropertyOptional({ description: 'Tickets with an active assignment to this developer' })
  @IsOptional()
  @IsUUID()
  developerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  creatorId?: string;

  @ApiPropertyOptional({ description: 'Title, description, or ticket code (BRM-0124, #124, 124)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isArchived?: boolean;

  @ApiPropertyOptional({ description: 'Past estimatedDeadline and not closed, completed, or rejected' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ description: 'Tickets assigned to the caller, or with at least one task assigned to them' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;
}
