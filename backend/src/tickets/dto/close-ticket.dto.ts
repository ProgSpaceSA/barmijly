import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CloseTicketDto {
  @ApiProperty()
  @IsString()
  closureNotes: string;
}
