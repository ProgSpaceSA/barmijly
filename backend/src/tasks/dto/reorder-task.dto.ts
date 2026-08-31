import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** Where the task should land. Siblings rebalance around it. */
export class ReorderTaskDto {
  @ApiProperty({ minimum: 0, description: 'Zero-based target position in the ticket list.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order: number;
}
