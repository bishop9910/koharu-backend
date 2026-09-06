// src/album/tag.controller.ts
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { AlbumService } from './album.service.js';
import { CreateTagDto } from './dto/create-tag.dto.js';
import { Tag } from '../entities/tag.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { MinRoleGuard, MinRole } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';

@ApiTags('tags')
@Controller('tags')
export class TagController {
  constructor(private readonly albumService: AlbumService) {}

  @Get()
  @ApiOperation({ summary: '获取标签列表', description: '公开接口，游客可访问' })
  @ApiOkResponse({ description: '标签列表', type: [Tag] })
  async findAll() {
    return this.albumService.findAllTags();
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.MODERATOR)
  @ApiOperation({ summary: '创建标签', description: '仅审核员及以上角色可创建' })
  @ApiOkResponse({ description: '创建成功', type: Tag })
  @ApiResponse({ status: 409, description: '标签已存在' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '权限不足：需要 MODERATOR 及以上角色' })
  async create(@Body() dto: CreateTagDto) {
    return this.albumService.createTag(dto.name);
  }
}
