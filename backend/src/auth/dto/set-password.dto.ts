import { IsString, MinLength, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetPasswordDto {
  @ApiProperty()
  @IsUUID()
  token: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;
}
