import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Priority,
  RequirementSource,
  RequirementStatus,
  TicketType,
} from '@prisma/client';
import { Transform } from 'class-transformer';

export class CreateRequirementDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'A meeting-sourced ask is captured from a point, not filed here.' })
  @IsUUID()
  companyId: string;

  @ApiPropertyOptional({ enum: RequirementSource, default: RequirementSource.OTHER })
  @IsOptional()
  @IsEnum(RequirementSource)
  source?: RequirementSource;

  @ApiPropertyOptional({ description: 'Where it came in — «واتساب من م. أحمد».' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourceNote?: string;

  @ApiPropertyOptional({ description: 'Pin it to a system. Required before promoting.' })
  @IsOptional()
  @IsUUID()
  systemId?: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ description: 'Who asked, when they have an account.' })
  @IsOptional()
  @IsUUID()
  requestedById?: string;

  @ApiPropertyOptional({ description: 'Who asked, when they do not.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  requestedByName?: string;

  @ApiPropertyOptional({ description: 'Who chases it inside the programming team.' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateRequirementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: RequirementSource })
  @IsOptional()
  @IsEnum(RequirementSource)
  source?: RequirementSource;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourceNote?: string | null;

  /** Pin or re-pin the system. Pass null to unpin; empty string reads as null. */
  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsUUID()
  systemId?: string | null;

  @ApiPropertyOptional({ enum: Priority, nullable: true })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsUUID()
  requestedById?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  requestedByName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}

export class ChangeRequirementStatusDto {
  @ApiProperty({
    enum: RequirementStatus,
    description: 'CONVERTED is set by promote only — it is refused here.',
  })
  @IsEnum(RequirementStatus)
  status: RequirementStatus;

  @ApiPropertyOptional({ description: 'Why — kept on the history row.' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class PromoteRequirementDto {
  @ApiPropertyOptional({ description: 'Override the default `(REQ-0004) title` ticket title.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({ enum: TicketType, default: TicketType.NEW_FEATURE })
  @IsOptional()
  @IsEnum(TicketType)
  type?: TicketType;
}

export class FilterRequirementsDto {
  @ApiPropertyOptional({ description: 'Title, body, or requirement code (REQ-0114, #114, 114)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: RequirementStatus })
  @IsOptional()
  @IsEnum(RequirementStatus)
  status?: RequirementStatus;

  @ApiPropertyOptional({ description: 'Still on the board — everything but CONVERTED/DECLINED' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  open?: boolean;

  @ApiPropertyOptional({ enum: RequirementSource })
  @IsOptional()
  @IsEnum(RequirementSource)
  source?: RequirementSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  systemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  meetingId?: string;

  @ApiPropertyOptional({ description: 'Owned by the caller, or raised by them' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ description: 'true surfaces requirements with no system yet' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : undefined))
  @IsBoolean()
  unpinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isArchived?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;
}
