import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BugSeverity, BugStatus, Priority } from '@prisma/client';
import { Transform } from 'class-transformer';

export class CreateBugDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  description: string;

  @ApiPropertyOptional({ description: 'Filed from a case. Omit for a standalone bug.' })
  @IsOptional()
  @IsUUID()
  testCaseId?: string;

  @ApiPropertyOptional({
    description: 'Link to an existing ticket without promoting. Same system/company as the bug.',
  })
  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @ApiPropertyOptional({ description: 'Required for a standalone bug; inherited from the case otherwise.' })
  @IsOptional()
  @IsUUID()
  systemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedBehavior?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actualBehavior?: string;

  @ApiPropertyOptional({ description: 'Browser, build, account — whatever reproduces it.' })
  @IsOptional()
  @IsString()
  environment?: string;

  @ApiProperty({ enum: BugSeverity, description: 'Impact. Scheduling urgency is `priority`.' })
  @IsEnum(BugSeverity)
  severity: BugSeverity;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}

export class UpdateBugDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedBehavior?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actualBehavior?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  environment?: string;

  @ApiPropertyOptional({ enum: BugSeverity })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority | null;

  /** Gated on `bug:assign` in the service — handing work out is a scoping call. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;

  /** Link to a case (inherits suite). Pass null to clear. Empty string → null. */
  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsUUID()
  testCaseId?: string | null;

  /** Link to an existing ticket without promoting. Pass null to unlink. */
  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsUUID()
  ticketId?: string | null;
}

export class ChangeBugStatusDto {
  @ApiProperty({ enum: BugStatus })
  @IsEnum(BugStatus)
  status: BugStatus;

  @ApiPropertyOptional({ description: 'Why — kept on the history row.' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class PromoteBugDto {
  @ApiPropertyOptional({ description: 'Override the default `(BUG-0004) title` ticket title.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;
}

export class FilterBugsDto {
  @ApiPropertyOptional({ description: 'Title, description, or bug code (BUG-0114, #114, 114)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: BugSeverity })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @ApiPropertyOptional({ enum: BugStatus })
  @IsOptional()
  @IsEnum(BugStatus)
  status?: BugStatus;

  @ApiPropertyOptional({
    description: 'Still needs work — OPEN, IN_PROGRESS, or FIXED. Same set as openCount.',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  open?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Assigned to the caller, or reported by them' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  systemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  suiteId?: string;

  @ApiPropertyOptional({ description: 'false surfaces bugs not yet promoted to a ticket' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : undefined))
  @IsBoolean()
  hasTicket?: boolean;

  @ApiPropertyOptional({ description: 'Detected on or after this date' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Detected on or before this date' })
  @IsOptional()
  @IsString()
  to?: string;

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
