import {
  Controller, Get, Post, Patch, Param, Body, UseGuards,
  UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { UserRole } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Get()
  findAll() {
    return this.companiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Post()
  @Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT)
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT)
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }

  @Post(':id/logo')
  @Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT)
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
  @Roles(UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT)
  deactivate(@Param('id') id: string) {
    return this.companiesService.deactivate(id);
  }
}
