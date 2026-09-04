import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ToolCategory, ToolStatus, ToolTeam } from '@prisma/client';

/** Six fields, nothing more — a longer form is a form nobody fills in. */
export class CreateToolDto {
  @ApiProperty({ example: 'Postman' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 'https://www.postman.com' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(300)
  website: string;

  @ApiProperty({ description: 'One or two lines: what problem does it solve?' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description: string;

  @ApiProperty({ description: 'Three or four short steps. Markdown, rendered read-only.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  gettingStarted: string;

  @ApiProperty({ enum: ToolCategory, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(4)
  @IsEnum(ToolCategory, { each: true })
  categories: ToolCategory[];

  @ApiProperty({ enum: ToolTeam, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5)
  @IsEnum(ToolTeam, { each: true })
  teams: ToolTeam[];
}

export class UpdateToolDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(300)
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  gettingStarted?: string;

  @ApiPropertyOptional({ enum: ToolCategory, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(4)
  @IsEnum(ToolCategory, { each: true })
  categories?: ToolCategory[];

  @ApiPropertyOptional({ enum: ToolTeam, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5)
  @IsEnum(ToolTeam, { each: true })
  teams?: ToolTeam[];
}

/**
 * Decline and retire both take a reason and both keep the row. Approve takes
 * none — there is nothing to explain about a yes.
 */
export class DecideToolDto {
  @ApiProperty({ description: 'Why. Kept on the row so the same ask does not return.' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  note: string;
}

export class FilterToolsDto {
  @ApiPropertyOptional({ description: 'Name or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ToolCategory })
  @IsOptional()
  @IsEnum(ToolCategory)
  category?: ToolCategory;

  @ApiPropertyOptional({ enum: ToolTeam })
  @IsOptional()
  @IsEnum(ToolTeam)
  team?: ToolTeam;

  @ApiPropertyOptional({
    enum: ToolStatus,
    description: 'Anything but APPROVED needs tool:manage — 403 otherwise.',
  })
  @IsOptional()
  @IsEnum(ToolStatus)
  status?: ToolStatus;
}
