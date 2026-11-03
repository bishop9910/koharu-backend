// src/album/album.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiExtraModels,
} from '@nestjs/swagger';
import { AlbumService } from './album.service.js';
import { AlbumReportService } from './album-report.service.js';
import { CreateAlbumDto } from './dto/create-album.dto.js';
import { UpdateAlbumDto } from './dto/update-album.dto.js';
import { UpdateAlbumImagesDto } from './dto/update-album-images.dto.js';
import { ListAlbumsQueryDto } from './dto/list-albums-query.dto.js';
import { SearchAlbumsQueryDto } from './dto/search-albums-query.dto.js';
import { CreateAlbumReportDto } from './dto/create-album-report.dto.js';
import { ReviewAlbumDto } from './dto/review-album.dto.js';
import { AlbumReactionDto } from './dto/album-reaction.dto.js';
import { AlbumReportItemDto } from './dto/album-report-response.dto.js';
import { AlbumDetailDto, AlbumSummaryDto } from './dto/album-response.dto.js';
import { AlbumReviewItemDto } from './dto/album-review-item.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard.js';
import { MinRoleGuard, MinRole } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';

@ApiTags('albums')
@ApiExtraModels(
  AlbumSummaryDto,
  AlbumDetailDto,
  AlbumReactionDto,
  AlbumReportItemDto,
  AlbumReviewItemDto,
)
@Controller('albums')
export class AlbumController {
  constructor(
    private readonly albumService: AlbumService,
    private readonly albumReportService: AlbumReportService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '创建图集', description: '仅 USER 及以上角色可创建，可携带已存在的标签' })
  @ApiOkResponse({ type: AlbumDetailDto, description: '创建成功，返回图集详情' })
  @ApiResponse({ status: 400, description: '标签不存在' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  async create(@Body() dto: CreateAlbumDto, @Req() req: any) {
    return this.albumService.create(dto, req.user);
  }

  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '搜索图集', description: '标题/描述模糊匹配 与 标签全部命中；仅返回当前用户可见的图集（公开或本人创建）' })
  @ApiOkResponse({
    description: '搜索结果分页列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/AlbumSummaryDto' } },
        total: { type: 'number', example: 3 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 1 },
      },
    },
  })
  async search(@Query() query: SearchAlbumsQueryDto, @Req() req: any) {
    return this.albumService.search(query, req.user);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '分页获取图集列表', description: '公开图集游客可见；私有图集只出现在本人的列表里（审核员及以上可在详情接口按 id 直接访问）' })
  @ApiOkResponse({
    description: '图集分页列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/AlbumSummaryDto' } },
        total: { type: 'number', example: 12 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 1 },
      },
    },
  })
  async findAll(@Query() query: ListAlbumsQueryDto, @Req() req: any) {
    return this.albumService.findAll(query, req.user);
  }

  @Get('favorites')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '我的收藏夹', description: '分页返回当前用户收藏的图集，按收藏时间倒序；已不可见的图集不会出现' })
  @ApiOkResponse({
    description: '收藏图集分页列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/AlbumSummaryDto' } },
        total: { type: 'number', example: 3 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 1 },
      },
    },
  })
  async findFavorites(@Query() query: ListAlbumsQueryDto, @Req() req: any) {
    return this.albumService.findFavorites(query, req.user);
  }

  @Get('liked')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '我点赞的图集', description: '分页返回当前用户点赞的图集，按点赞时间倒序' })
  @ApiOkResponse({
    description: '点赞图集分页列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/AlbumSummaryDto' } },
        total: { type: 'number', example: 4 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 1 },
      },
    },
  })
  async findLiked(@Query() query: ListAlbumsQueryDto, @Req() req: any) {
    return this.albumService.findLiked(query, req.user);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取图集详情', description: '包含完整图片与标签；私有图集仅本人或审核员及以上可访问，其余返回 404' })
  @ApiOkResponse({ type: AlbumDetailDto, description: '图集详情' })
  @ApiNotFoundResponse({ description: '图集不存在，或私有图集对当前用户不可见' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.albumService.findOne(id, req.user);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '修改图集信息', description: '本人可修改（除非被管理员锁定）；上级角色可修改，设为私有会锁定图集' })
  @ApiOkResponse({ type: AlbumDetailDto, description: '更新成功，返回图集详情' })
  @ApiResponse({ status: 400, description: '标签不存在' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权修改该图集' })
  @ApiNotFoundResponse({ description: '图集不存在' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAlbumDto, @Req() req: any) {
    return this.albumService.update(id, dto, req.user);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除图集', description: '仅删除图集（不会删除图片本身），本人或上级角色可操作' })
  @ApiOkResponse({ description: '删除成功', schema: { type: 'object', properties: { message: { type: 'string', example: '图集已删除' } } } })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权删除该图集' })
  @ApiNotFoundResponse({ description: '图集不存在' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    await this.albumService.remove(id, req.user);
    return { message: '图集已删除' };
  }

  @Post(':id/unlock')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.ADMIN)
  @ApiOperation({ summary: '解锁图集', description: '仅管理员及以上可解锁被锁定的图集，解锁后恢复公开，本人可重新修改' })
  @ApiOkResponse({ type: AlbumDetailDto, description: '解锁成功，返回图集详情' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '权限不足或无权解锁该图集' })
  @ApiNotFoundResponse({ description: '图集不存在' })
  async unlock(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.albumService.unlock(id, req.user);
  }

  @Post(':id/images')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '向图集归档图片', description: '仅可归档已过审的图片；本人只能归档自己的图片' })
  @ApiOkResponse({ type: AlbumDetailDto, description: '归档成功，返回图集详情' })
  @ApiResponse({ status: 400, description: '图片不存在或未过审' })
  @ApiNotFoundResponse({ description: '图集不存在' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权修改该图集' })
  async addImages(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAlbumImagesDto, @Req() req: any) {
    return this.albumService.addImages(id, dto.imageIds, req.user);
  }

  @Delete(':id/images')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '从图集移除图片', description: '仅移除归档关系，不会删除图片本身' })
  @ApiOkResponse({ type: AlbumDetailDto, description: '移除成功，返回图集详情' })
  @ApiNotFoundResponse({ description: '图集不存在' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权修改该图集' })
  async removeImages(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAlbumImagesDto, @Req() req: any) {
    return this.albumService.removeImages(id, dto.imageIds, req.user);
  }

  @Post(':id/like')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '点赞图集', description: '幂等：已点赞时重复调用仍返回当前点赞/收藏统计' })
  @ApiOkResponse({ type: AlbumReactionDto, description: '点赞后的统计信息' })
  @ApiNotFoundResponse({ description: '图集不存在或对当前用户不可见' })
  async like(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.albumService.likeAlbum(id, req.user);
  }

  @Delete(':id/like')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '取消点赞', description: '幂等：未点赞时调用也返回成功' })
  @ApiOkResponse({ type: AlbumReactionDto, description: '取消后的统计信息' })
  async unlike(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.albumService.unlikeAlbum(id, req.user);
  }

  @Post(':id/favorite')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '收藏图集', description: '幂等：已收藏时重复调用仍返回当前统计' })
  @ApiOkResponse({ type: AlbumReactionDto, description: '收藏后的统计信息' })
  @ApiNotFoundResponse({ description: '图集不存在或对当前用户不可见' })
  async favorite(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.albumService.favoriteAlbum(id, req.user);
  }

  @Delete(':id/favorite')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '取消收藏', description: '幂等：未收藏时调用也返回成功' })
  @ApiOkResponse({ type: AlbumReactionDto, description: '取消后的统计信息' })
  async unfavorite(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.albumService.unfavoriteAlbum(id, req.user);
  }

  @Post(':id/reports')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '举报图集', description: 'USER 及以上可举报；不能举报自己的图集；同一用户对同一图集仅可保留一条待核实举报' })
  @ApiOkResponse({
    description: '举报已提交',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: '举报已提交，等待审核员核实' },
        report: { $ref: '#/components/schemas/AlbumReportItemDto' },
      },
    },
  })
  @ApiResponse({ status: 400, description: '不能举报自己的图集' })
  @ApiResponse({ status: 409, description: '已有一条待核实的举报' })
  async report(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAlbumReportDto,
    @Req() req: any,
  ) {
    return this.albumReportService.createReport(id, dto, req.user);
  }

  @Post(':id/submit-review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '重新提交图集评审', description: '仅图集所有者可提交；被驳回的图集重新进入待评审名单，不额外获得修改机会' })
  @ApiOkResponse({ type: AlbumDetailDto, description: '提交成功，返回图集详情' })
  @ApiForbiddenResponse({ description: '只有图集所有者可以提交评审' })
  @ApiResponse({ status: 409, description: '图集已在待评审名单中' })
  async submitReview(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.albumService.submitReview(id, req.user);
  }

  @Post(':id/review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.MODERATOR)
  @ApiOperation({
    summary: '整集评审',
    description: '审核员及以上一次性评审图集中的全部待审图片，并给出图集评审结果；驳回必须提供原因',
  })
  @ApiOkResponse({
    description: '评审完成，返回图集详情与本次处理的图片数量',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: '图集评审通过' },
        approvedImages: { type: 'number', example: 3 },
        rejectedImages: { type: 'number', example: 0 },
        album: { $ref: '#/components/schemas/AlbumDetailDto' },
      },
    },
  })
  @ApiForbiddenResponse({ description: '不能审核自己的图集，或待审图片中包含自己上传的图片' })
  @ApiResponse({ status: 409, description: '图集不在待评审名单中，或已被其他审核员处理' })
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewAlbumDto,
    @Req() req: any,
  ) {
    return this.albumService.reviewAlbum(id, dto, req.user);
  }
}
