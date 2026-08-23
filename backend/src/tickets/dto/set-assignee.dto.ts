import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Body for the roster endpoints: add an assignee, or hand the lead over. */
export class SetAssigneeDto {
  @ApiProperty()
  @IsUUID()
  developerId: string;
}
