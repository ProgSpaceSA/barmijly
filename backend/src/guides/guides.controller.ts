import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GuidesService } from './guides.service';
import { CreateGuideDto, UpdateGuideDto } from './dto/guide.dto';

/**
 * Hub workflow rules («دورة العمل»). Read with `tool:read`; write with `tool:manage`.
 */
@ApiTags('Guides')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('guides')
export class GuidesController {
  constructor(private guides: GuidesService) {}

  @Get()
  @ApiOperation({ summary: 'Ordered workflow rules for the hub' })
  findAll(@CurrentUser() user: any) {
    return this.guides.findAll(user);
  }

  @Post()
  @ApiOperation({ summary: 'Add a workflow section (managers)' })
  create(@Body() dto: CreateGuideDto, @CurrentUser() user: any) {
    return this.guides.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a workflow section (managers)' })
  update(@Param('id') id: string, @Body() dto: UpdateGuideDto, @CurrentUser() user: any) {
    return this.guides.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a workflow section (managers)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.guides.remove(id, user);
  }
}
