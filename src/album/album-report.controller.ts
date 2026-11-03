// src/album/album-report.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiExtraModels,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AlbumReportService } from './album-report.service.js';
import { ListAlbumReportsQueryDto } from './dto/list-album-reports-query.dto.js';
import { HandleAlbumReportDto } from './dto/handle-album-report.dto.js';
import { AlbumReportItemDto } from './dto/album-report-response.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { MinRoleGuard, MinRole } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';

@ApiTags('album-reports')
@ApiBearerAuth()
@ApiExtraModels(AlbumReportItemDto)
@UseGuards(JwtAuthGuard, MinRoleGuard)
@MinRole(Role.MODERATOR)
@Controller('album-reports')
export class AlbumReportController {
  constructor(private readonly albumReportService: AlbumReportService) {}

  @Get()
  @ApiOperation({ summary: '举报列表', description: '审核员及以上可查看图集举报，可按状态筛选，按提交时间倒序' })
  @ApiOkResponse({
    description: '举报分页列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/AlbumReportItemDto' } },
        total: { type: 'number', example: 3 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 1 },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '权限不足，仅审核员及以上可查看' })
  async list(@Query() query: ListAlbumReportsQueryDto) {
    return this.albumReportService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '举报详情', description: '审核员及以上可查看单条举报' })
  @ApiOkResponse({ type: AlbumReportItemDto, description: '举报详情' })
  @ApiNotFoundResponse({ description: '举报不存在' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.albumReportService.findOne(id);
  }

  @Post(':id/verify')
  @ApiOperation({
    summary: '核实举报',
    description: '审核员及以上核实举报后，图集进入待评审名单；若图集原本不在评审中，会重置本次修改机会',
  })
  @ApiOkResponse({
    description: '核实成功',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: '举报已核实，图集已加入待评审名单' },
        report: { $ref: '#/components/schemas/AlbumReportItemDto' },
      },
    },
  })
  @ApiNotFoundResponse({ description: '举报不存在' })
  @ApiForbiddenResponse({ description: '权限不足' })
  async verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HandleAlbumReportDto,
    @Req() req: any,
  ) {
    return this.albumReportService.verify(id, dto, req.user);
  }

  @Post(':id/dismiss')
  @ApiOperation({ summary: '驳回举报', description: '审核员及以上认为举报不成立时驳回' })
  @ApiOkResponse({
    description: '驳回成功',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: '举报已驳回' },
        report: { $ref: '#/components/schemas/AlbumReportItemDto' },
      },
    },
  })
  @ApiNotFoundResponse({ description: '举报不存在' })
  @ApiForbiddenResponse({ description: '权限不足' })
  async dismiss(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HandleAlbumReportDto,
    @Req() req: any,
  ) {
    return this.albumReportService.dismiss(id, dto, req.user);
  }
}
