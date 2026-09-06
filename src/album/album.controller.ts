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
} from '@nestjs/swagger';
import { AlbumService } from './album.service.js';
import { CreateAlbumDto } from './dto/create-album.dto.js';
import { UpdateAlbumDto } from './dto/update-album.dto.js';
import { UpdateAlbumImagesDto } from './dto/update-album-images.dto.js';
import { ListAlbumsQueryDto } from './dto/list-albums-query.dto.js';
import { SearchAlbumsQueryDto } from './dto/search-albums-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard.js';
import { MinRoleGuard, MinRole } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';

@ApiTags('albums')
@Controller('albums')
export class AlbumController {
  constructor(private readonly albumService: AlbumService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '创建图集', description: '仅 USER 及以上角色可创建，可携带已存在的标签' })
  @ApiOkResponse({ description: '创建成功，返回图集详情' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  async create(@Body() dto: CreateAlbumDto, @Req() req: any) {
    return this.albumService.create(dto, req.user);
  }

  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '搜索图集', description: '标题/描述模糊匹配 与 标签全部命中；仅返回当前用户可见的图集' })
  @ApiOkResponse({ description: '搜索结果分页列表' })
  async search(@Query() query: SearchAlbumsQueryDto, @Req() req: any) {
    return this.albumService.search(query, req.user);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '分页获取图集列表', description: '公开图集游客可见；私有图集仅本人或管理员可见' })
  @ApiOkResponse({ description: '图集分页列表' })
  async findAll(@Query() query: ListAlbumsQueryDto, @Req() req: any) {
    return this.albumService.findAll(query, req.user);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取图集详情', description: '包含完整图片与标签；私有图集仅本人或管理员可见' })
  @ApiOkResponse({ description: '图集详情' })
  @ApiNotFoundResponse({ description: '图集不存在' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.albumService.findOne(id, req.user);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '修改图集信息', description: '本人可修改（除非被管理员锁定）；上级角色可修改，设为私有会锁定图集' })
  @ApiOkResponse({ description: '更新成功，返回图集详情' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权修改该图集' })
  @ApiNotFoundResponse({ description: '图集不存在' })
  async update(@Param('id') id: string, @Body() dto: UpdateAlbumDto, @Req() req: any) {
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
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.albumService.remove(id, req.user);
    return { message: '图集已删除' };
  }

  @Post(':id/unlock')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.ADMIN)
  @ApiOperation({ summary: '解锁图集', description: '仅管理员及以上可解锁被锁定的图集，解锁后恢复公开，本人可重新修改' })
  @ApiOkResponse({ description: '解锁成功，返回图集详情' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '权限不足或无权解锁该图集' })
  @ApiNotFoundResponse({ description: '图集不存在' })
  async unlock(@Param('id') id: string, @Req() req: any) {
    return this.albumService.unlock(id, req.user);
  }

  @Post(':id/images')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '向图集归档图片', description: '仅可归档已过审的图片；本人只能归档自己的图片' })
  @ApiOkResponse({ description: '归档成功，返回图集详情' })
  @ApiResponse({ status: 400, description: '图片不存在或未过审' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权修改该图集' })
  async addImages(@Param('id') id: string, @Body() dto: UpdateAlbumImagesDto, @Req() req: any) {
    return this.albumService.addImages(id, dto.imageIds, req.user);
  }

  @Delete(':id/images')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '从图集移除图片', description: '仅移除归档关系，不会删除图片本身' })
  @ApiOkResponse({ description: '移除成功，返回图集详情' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权修改该图集' })
  async removeImages(@Param('id') id: string, @Body() dto: UpdateAlbumImagesDto, @Req() req: any) {
    return this.albumService.removeImages(id, dto.imageIds, req.user);
  }
}
