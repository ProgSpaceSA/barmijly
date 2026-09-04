import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeedbackKind, FeedbackStatus } from '@prisma/client';

const emptyToUndef = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export class CreateFeedbackDto {
  @ApiProperty({ example: 'نحتاج طريقة أوضح للتواصل' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @ApiProperty({ description: 'The request in full — what, why, who it affects.' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;

  @ApiProperty({ enum: FeedbackKind })
  @IsEnum(FeedbackKind)
  kind: FeedbackKind;

  @ApiPropertyOptional({ description: 'Named person. Omit for a general request to leadership.' })
  @IsOptional()
  @Transform(emptyToUndef)
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  proposedSolution?: string;
}

export class UpdateFeedbackDto {
  @ApiPropertyOptional({ enum: FeedbackStatus })
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @ApiPropertyOptional({
    description: 'Set a person, or send null to make the row general again. Leadership only.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}

export class FilterFeedbackDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: FeedbackKind })
  @IsOptional()
  @IsEnum(FeedbackKind)
  kind?: FeedbackKind;

  @ApiPropertyOptional({ enum: FeedbackStatus })
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndef)
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'No named person — leadership inbox.' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unassigned?: boolean;

  @ApiPropertyOptional({ description: 'Assigned to the caller.' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mine?: boolean;
}
