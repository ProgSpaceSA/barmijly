import {
  Controller, Post, Patch, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets/:ticketId/comments')
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Post()
  @ApiOperation({ summary: 'Post a comment, notifying the mentioned users' })
  create(
    @Param('ticketId') ticketId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.commentsService.create({ ticketId }, dto, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit your own comment; sending mentions replaces the mention list',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.commentsService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete your own comment (moderators may delete any)' })
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.commentsService.delete(id, user);
  }
}

/**
 * The same thread, hung off a requirement instead of a ticket.
 *
 * Edit and delete resolve their parent from the stored row, so they are the
 * ticket routes above — registering a second pair here would be two routes for
 * one behaviour. Only `create` needs to know which parent it is opening.
 */
@ApiTags('Comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('requirements/:requirementId/comments')
export class RequirementCommentsController {
  constructor(private commentsService: CommentsService) {}

  @Post()
  @ApiOperation({ summary: 'Post a comment on a requirement' })
  create(
    @Param('requirementId') requirementId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.commentsService.create({ requirementId }, dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit your own comment on a requirement' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.commentsService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete your own comment on a requirement' })
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.commentsService.delete(id, user);
  }
}
