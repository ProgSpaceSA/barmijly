import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketDependencyType } from '@prisma/client';

/** Which end of the relation this ticket sits on. */
export type DependencyDirection = 'blockedBy' | 'blocks';

export class AddDependencyDto {
  @ApiProperty({ description: 'The other ticket in the relation.' })
  @IsUUID()
  otherTicketId: string;

  @ApiPropertyOptional({
    enum: ['blockedBy', 'blocks'],
    description:
      'blockedBy (default): this ticket waits on the other. blocks: the other waits on this one.',
  })
  @IsOptional()
  @IsIn(['blockedBy', 'blocks'])
  direction?: DependencyDirection;

  @ApiPropertyOptional({ enum: TicketDependencyType, default: TicketDependencyType.BLOCKS })
  @IsOptional()
  @IsEnum(TicketDependencyType)
  type?: TicketDependencyType;
}
