import {
  Controller, Get, Post, Patch, Param, Body, UseGuards,
  UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { rolesWith } from '../access/permissions';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// Derived from the action matrix rather than restated here, so a change to
// `ROLE_ACTIONS` moves these endpoints with it.
const MANAGERS = rolesWith('structure:manage');
const DEACTIVATORS = rolesWith('structure:deactivate');

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.companiesService.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.companiesService.findOne(id, user);
  }

  @Post()
  @Roles(...MANAGERS)
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Patch(':id')
  @Roles(...MANAGERS)
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }

  @Post(':id/logo')
  @Roles(...MANAGERS)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || './uploads'),
        filename: (req, file, cb) => cb(null, `${uuid()}${extname(file.originalname)}`),
      }),
      fileFilter: (req, file, cb) => {
        const ok = file.mimetype.startsWith('image/');
        cb(ok ? null : new Error('Only images allowed'), ok);
      },
    }),
  )
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile(new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })] }))
    file: Express.Multer.File,
  ) {
    return this.companiesService.uploadLogo(id, file);
  }

  @Patch(':id/deactivate')
  @Roles(...DEACTIVATORS)
  deactivate(@Param('id') id: string) {
    return this.companiesService.deactivate(id);
  }
}
