import { IsString, IsOptional, IsEnum, IsUUID, MinLength, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TestResult } from '@prisma/client';

export class CreateCaseDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preconditions?: string;

  @ApiProperty({ description: 'What passing looks like. May be empty on a draft case.' })
  @IsString()
  expectedResult: string;

  @ApiPropertyOptional({ description: 'The one ticket this case is primarily about.' })
  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}

export class UpdateCaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preconditions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedResult?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actualResult?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ticketId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;
}

export class RecordResultDto {
  @ApiProperty({ enum: TestResult })
  @IsEnum(TestResult)
  result: TestResult;

  @ApiPropertyOptional({ description: 'What actually happened. Stored on the case, not only in history.' })
  @IsOptional()
  @IsString()
  actualResult?: string;

  @ApiPropertyOptional({ description: 'Why — kept on the history row.' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ReorderDto {
  @ApiProperty({ description: 'Target position, 0-based, inside its parent.' })
  @IsInt()
  @Min(0)
  order: number;
}
