import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MeetingStatus, MeetingType, PointKind, Priority } from '@prisma/client';
import { Transform, Type } from 'class-transformer';

export class CreateMeetingDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'The agenda, written before the meeting.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: MeetingType })
  @IsOptional()
  @IsEnum(MeetingType)
  type?: MeetingType;

  @ApiProperty({ description: 'A meeting belongs to exactly one company.' })
  @IsUUID()
  companyId: string;

  @ApiPropertyOptional({ description: 'When it is held. ISO date-time.' })
  @IsOptional()
  @IsDateString()
  heldAt?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1440 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMins?: number;

  @ApiPropertyOptional({ description: 'Room, office, or a meeting link.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @ApiPropertyOptional({ type: [String], description: 'Systems this meeting covers.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  systemIds?: string[];
}

export class UpdateMeetingDto {
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

  @ApiPropertyOptional({ enum: MeetingType })
  @IsOptional()
  @IsEnum(MeetingType)
  type?: MeetingType;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsDateString()
  heldAt?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 1440 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMins?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string | null;
}

export class FilterMeetingsDto {
  @ApiPropertyOptional({ description: 'Title, agenda, or meeting code (MTG-0007, #7, 7)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  systemId?: string;

  @ApiPropertyOptional({ enum: MeetingStatus })
  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;

  @ApiPropertyOptional({ enum: MeetingType })
  @IsOptional()
  @IsEnum(MeetingType)
  type?: MeetingType;

  @ApiPropertyOptional({ description: 'Organised by the caller, or with them as an attendee' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  mine?: boolean;

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

  @ApiPropertyOptional({ description: 'ISO date — meetings held on or after this day' })
  @IsOptional()
  @IsString()
  heldFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date — meetings held on or before this day' })
  @IsOptional()
  @IsString()
  heldTo?: string;
}

/** Either an internal `userId`, or the free-text trio for an external guest. */
export class AddAttendeeDto {
  @ApiPropertyOptional({ description: 'An internal account. Omit for an external guest.' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Required when there is no `userId`.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  organization?: string;
}

/** Replaces the whole `MeetingSystem` set — send every system that stays. */
export class SetMeetingSystemsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  systemIds: string[];
}

export class CreatePointDto {
  /**
   * May be empty. «إضافة بند» inserts the row and focuses it, so the text
   * arrives on the first blur — the same shape as a test step.
   */
  @ApiPropertyOptional({ description: 'The minutes line itself. Appended at the end.' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ enum: PointKind })
  @IsOptional()
  @IsEnum(PointKind)
  kind?: PointKind;

  @ApiPropertyOptional({ description: 'Who raised it, when they have an account.' })
  @IsOptional()
  @IsUUID()
  raisedById?: string;

  @ApiPropertyOptional({ description: 'Who raised it, when they do not — «الرئيس التنفيذي».' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  raisedByName?: string;
}

export class UpdatePointDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @ApiPropertyOptional({ enum: PointKind })
  @IsOptional()
  @IsEnum(PointKind)
  kind?: PointKind;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsUUID()
  raisedById?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  raisedByName?: string | null;
}

export class ReorderPointDto {
  @ApiProperty()
  @IsUUID()
  pointId: string;

  @ApiProperty({ minimum: 0, description: 'Zero-based target position.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order: number;
}

/** Turns one minutes line into a tracked requirement. */
export class CapturePointDto {
  @ApiPropertyOptional({ description: 'Defaults to the point body, trimmed to a title.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Defaults to the full point body.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Pin it to a system straight away.' })
  @IsOptional()
  @IsUUID()
  systemId?: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ description: 'Who chases it inside the programming team.' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
