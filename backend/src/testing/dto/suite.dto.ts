import { IsString, IsOptional, IsEnum, IsUUID, MinLength, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TestState } from '@prisma/client';
import { Transform } from 'class-transformer';

export class CreateSuiteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsUUID()
  systemId: string;

  @ApiProperty()
  @IsUUID()
  companyId: string;
}

export class UpdateSuiteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  /** Hand the suite to another author. Ownership is not a state transition. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

/** Suite health, derived from the rollup rather than stored. */
export type SuiteHealth = 'failing' | 'open-bugs' | 'not-run';

export class FilterSuitesDto {
  @ApiPropertyOptional({ description: 'Title, description, or suite code (TS-0007, #7, 7)' })
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

  @ApiPropertyOptional({ enum: TestState })
  @IsOptional()
  @IsEnum(TestState)
  state?: TestState;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Owned by the caller, or with a case assigned to them' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ enum: ['failing', 'open-bugs', 'not-run'] })
  @IsOptional()
  @IsEnum(['failing', 'open-bugs', 'not-run'])
  health?: SuiteHealth;

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

export class LinkTicketDto {
  @ApiProperty()
  @IsUUID()
  ticketId: string;
}
