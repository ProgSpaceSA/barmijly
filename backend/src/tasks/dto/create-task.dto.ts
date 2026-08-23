import { IsString, IsOptional, MinLength, IsDateString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  assignedToId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Estimated effort in hours.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  estimatedHours?: number;

  @ApiPropertyOptional({ description: 'Difficulty 1–5, same scale as the ticket.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficultyLevel?: number;
}
