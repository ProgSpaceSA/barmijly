import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** QA returns the ticket to development with a documented reason. */
export class RequestChangesDto {
  @ApiProperty({ description: 'Why the ticket is going back to development.' })
  @IsString()
  @MinLength(3)
  reason: string;
}
