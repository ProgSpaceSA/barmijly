import { IsString, MinLength, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStepDto {
  /**
   * May be empty. «+ إضافة خطوة» inserts the row and focuses it, so the text
   * arrives on the first blur — and `publish` is what refuses a case whose
   * steps are still blank.
   */
  @ApiPropertyOptional({ description: 'Step text. Appended at the end of the list.' })
  @IsOptional()
  @IsString()
  body?: string;
}

export class UpdateStepDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;
}
