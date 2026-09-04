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
  ForbiddenException,
  Query,
  HttpStatus
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiBearerAuth, 
  ApiOperation, 
  ApiOkResponse, 
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse
} from '@nestjs/swagger';
import { UserService } from './user.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { FindUsersQueryDto } from './dto/find-users-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { RolesGuard, Roles } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';
import { User } from '../entities/user.entity.js'; // 👈 引入 User 实体用于 Swagger 类型推断

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({ summary: '注册新用户', description: '创建账号，成功后需前往 /auth/login 登录' })
  @ApiOkResponse({ 
    description: '注册成功，返回脱敏后的用户信息（不包含密码）',
    type: User 
  })
  @ApiResponse({ status: 400, description: '请求参数校验失败 (如用户名过短、邮箱格式错误)' })
  @ApiResponse({ status: 409, description: '用户名或邮箱已被注册' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: '分页获取用户列表', description: '仅限管理员和审核员访问' })
  @ApiOkResponse({
    description: '分页用户列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/User' } },
        total: { type: 'number', example: 150 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 8 }
      }
    }
  })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '权限不足：需要 ADMIN 或 MODERATOR 角色' })
  async findAll(@Query() query: FindUsersQueryDto) {
    return this.userService.findAll(query.page ?? 1, query.limit ?? 20);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '获取当前登录用户的详细信息' })
  @ApiOkResponse({ description: '返回当前用户的完整信息', type: User })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  async getSelfUserInfo(@Req() req: any) {
    return this.userService.findOne(req.user.id);
  }

  @Patch('me/password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '修改当前用户的密码', description: '必须提供正确的旧密码' })
  @ApiOkResponse({ 
    description: '密码修改成功',
    schema: { type: 'object', properties: { message: { type: 'string', example: '密码修改成功' } } }
  })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiResponse({ status: 400, description: '原密码错误 或 新密码不符合长度要求' })
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.userService.changePassword(req.user.id, dto.oldPassword, dto.newPassword);
  }

  @Get(':id/public')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '获取用户的公开资料', description: '返回用户名、简介、角色和头像路径' })
  @ApiOkResponse({
    description: '公开资料',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        bio: { type: 'string', nullable: true },
        role: { type: 'string', enum: Object.values(Role) },
        avatar: { type: 'object', nullable: true, properties: { path: { type: 'string' } } }
      }
    }
  })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  async getPublicProfile(@Param('id') id: string) {
    return this.userService.findPublicProfile(id);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '获取单个用户详细信息', description: '只能查看自己，或管理员查看任何人' })
  @ApiOkResponse({ description: '返回用户详细信息', type: User })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权查看其他用户的详细隐私信息' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    if (req.user.id !== id && req.user.role !== Role.ADMIN) {
      throw new ForbiddenException('无权查看其他用户的详细信息');
    }
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '更新用户信息', description: '只能修改自己的信息，或管理员修改任何人' })
  @ApiOkResponse({ description: '更新成功，返回最新用户信息', type: User })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权修改其他用户的信息' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  async update(
    @Param('id') id: string, 
    @Body() updateUserDto: UpdateUserDto, 
    @Req() req: any
  ) {
    return this.userService.update(id, updateUserDto, req.user);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除用户 (软删除)', description: '只能删除自己，或管理员删除任何人。会联动删除头像文件。' })
  @ApiOkResponse({ 
    description: '删除成功',
    schema: { type: 'object', properties: { message: { type: 'string', example: '用户已删除' } } }
  })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权删除该用户' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.userService.remove(id, req.user);
  }

  @Patch(':id/role')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '修改用户角色', description: '严格限制：仅限管理员操作' })
  @ApiOkResponse({ description: '角色修改成功，返回最新用户信息', type: User })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '仅管理员可修改用户角色' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  async updateRole(
    @Param('id') id: string, 
    @Body('role') role: Role, 
    @Req() req: any
  ) {
    return this.userService.updateRole(id, role, req.user);
  }
}