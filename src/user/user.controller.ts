// src/user/user.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
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
  ApiConflictResponse,
  ApiExtraModels,
  ApiHeader,
} from '@nestjs/swagger';
import { UserService } from './user.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { FindUsersQueryDto } from './dto/find-users-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { ReauthGuard } from '../auth/guards/reauth.guard.js';
import { MinRoleGuard, MinRole } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UserListItemDto } from './dto/user-list-item.dto.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';

@ApiTags('users')
@ApiExtraModels(UserListItemDto)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({ summary: '注册新用户', description: '创建账号，默认角色为 USER，成功后需前往 /auth/login 登录' })
  @ApiOkResponse({
    description: '注册成功，返回脱敏后的用户信息（不包含密码）',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数校验失败 (如用户名过短、邮箱格式错误)' })
  @ApiResponse({ status: 409, description: '用户名或邮箱已被注册' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.MODERATOR)
  @ApiOperation({ summary: '分页获取用户列表', description: '仅限审核员及以上角色访问' })
  @ApiOkResponse({
    description: '分页用户列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/UserListItemDto' } },
        total: { type: 'number', example: 150 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 8 },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '权限不足：需要 MODERATOR 及以上角色' })
  async findAll(@Query() query: FindUsersQueryDto) {
    return this.userService.findAll(query.page ?? 1, query.limit ?? 20);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '获取当前登录用户的详细信息' })
  @ApiOkResponse({ description: '返回当前用户的完整信息', type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  async getSelfUserInfo(@Req() req: any) {
    return this.userService.getSelf(req.user.id);
  }

  @Patch('me/password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ReauthGuard)
  @ApiHeader({
    name: 'X-Reauth-Token',
    description: '来自 POST /api/auth/verify-password 的短期再认证票据',
    required: true,
  })
  @ApiOperation({
    summary: '修改当前用户的密码',
    description:
      '需先调用 POST /api/auth/verify-password 校验当前密码，拿到再认证票据后放进 X-Reauth-Token；本接口不再接收旧密码。',
  })
  @ApiOkResponse({
    description: '密码修改成功',
    schema: { type: 'object', properties: { message: { type: 'string', example: '密码修改成功' } } },
  })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token，或再认证票据缺失/无效/已过期' })
  @ApiResponse({ status: 400, description: '新密码不符合长度要求，或密码解密失败' })
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.userService.changePassword(req.user.id, dto.newPassword, dto.encrypted);
  }

  @Get(':id/public')
  @ApiOperation({ summary: '获取用户的公开资料', description: '公开接口，游客可访问，返回用户名、简介、角色、头像路径与头像图片地址' })
  @ApiOkResponse({
    description: '公开资料',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        bio: { type: 'string', nullable: true },
        role: { type: 'string', enum: Object.values(Role) },
        avatar: { type: 'object', nullable: true, properties: { path: { type: 'string' } } },
        avatarUrl: {
          type: 'string',
          nullable: true,
          example: '/api/avatars/550e8400-e29b-41d4-a716-446655440000/image',
          description: '头像图片流地址（带 /api 前缀，可直接作为 img src）；无头像时为 null',
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: '用户不存在' })
  async getPublicProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findPublicProfile(id);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '获取单个用户详细信息', description: '只能查看自己，或由具备管理权限的角色查看下级用户' })
  @ApiOkResponse({ description: '返回用户详细信息', type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权查看其他用户的详细隐私信息' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.userService.getUserDetail(id, req.user);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '更新用户信息', description: '本人可修改用户名/邮箱/简介；管理员可修改下级用户的邮箱/简介（不能改他人用户名）' })
  @ApiOkResponse({ description: '更新成功，返回最新用户信息', type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权修改其他用户的信息' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  @ApiConflictResponse({ description: '用户名已被占用，或邮箱已被其他用户使用' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: any,
  ) {
    return this.userService.update(id, updateUserDto, req.user);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ReauthGuard)
  @ApiHeader({
    name: 'X-Reauth-Token',
    description: '删除账号属于敏感操作，需先调用 POST /api/auth/verify-password 获取再认证票据',
    required: true,
  })
  @ApiOperation({
    summary: '删除用户 (软删除)',
    description:
      '敏感操作：需先在 X-Reauth-Token 中携带有效的再认证票据。只能删除自己，或由上级角色删除下级用户。会联动删除头像文件。',
  })
  @ApiOkResponse({
    description: '删除成功',
    schema: { type: 'object', properties: { message: { type: 'string', example: '用户已删除' } } },
  })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token，或再认证票据缺失/无效/已过期' })
  @ApiForbiddenResponse({ description: '无权删除该用户' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    await this.userService.remove(id, req.user);
    return { message: '用户已删除' };
  }

  @Patch(':id/role')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard, ReauthGuard)
  @MinRole(Role.MODERATOR)
  @ApiHeader({
    name: 'X-Reauth-Token',
    description: '修改角色属于敏感操作，需先调用 POST /api/auth/verify-password 获取再认证票据',
    required: true,
  })
  @ApiOperation({
    summary: '修改用户角色',
    description:
      '敏感操作：需先在 X-Reauth-Token 中携带有效的再认证票据。超级管理员可授予 ADMIN/MODERATOR/USER/GUEST；管理员可授予 MODERATOR/USER/GUEST；审核员可授予 USER/GUEST',
  })
  @ApiOkResponse({ description: '角色修改成功，返回最新用户信息', type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token，或再认证票据缺失/无效/已过期' })
  @ApiForbiddenResponse({ description: '无权修改该用户的角色' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() req: any,
  ) {
    return this.userService.updateRole(id, dto.role, req.user);
  }
}
