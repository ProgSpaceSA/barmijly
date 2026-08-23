import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * req.md §21: «أي تأخير يجب أن يكون له سبب موثق» — any delay must have a
 * documented reason. So the reason is required, not optional.
 */
export class PauseTicketDto {
  @ApiProperty({ description: 'Why the ticket is stopping. Shown on the ticket and in the history.' })
  @IsString()
  @MinLength(3)
  reason: string;

  @ApiPropertyOptional({ description: 'The ticket this one is waiting on, when there is one.' })
  @IsOptional()
  @IsUUID()
  blockedByTicketId?: string;
}

export class ResumeTicketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
