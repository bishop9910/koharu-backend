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
  ForbiddenException, // 👈 引入
  Query
} from '@nestjs/common';
import { UserService } from './user.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js'; // 保持你的路径
import { RolesGuard, Roles } from '../common/guards/role.guard.js'; // 保持你的路径
import { Role } from '../enums/role.enum.js';
import { FindUsersQueryDto } from './dto/find-users-query.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * 注册接口 (公开)
   * 前端调用此接口创建账号，成功后前端再引导用户去 /auth/login 登录
   */
  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  /**
   * 管理员和审核分页获取用户列表
   * GET /users?page=1&limit=20
   */
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  async findAll(@Query() query: FindUsersQueryDto) {
    return this.userService.findAll(query.page ?? 1, query.limit ?? 20);
  }

  /**
   * 获取自己的用户信息
   * GET /users/me
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getSelfUserInfo(@Req() req: any) {
    return this.userService.findOne(req.user.id);
  }

   /**
   * 修改自己的密码
   * PATCH /users/me/password
   */
  @ApiBearerAuth()
  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.userService.changePassword(req.user.id, dto.oldPassword, dto.newPassword);
  }

  /**
   * 获取用户的公开资料 (用户名、简介、角色、头像)(需登录)
   * GET /users/:id/public
   */
  @ApiBearerAuth()
  @Get(':id/public')
  @UseGuards(JwtAuthGuard)
  async getPublicProfile(@Param('id') id: string) {
    return this.userService.findPublicProfile(id);
  }

  /**
   * 获取单个用户详情 (严格权限校验)
   * GET /users/:id
   */
  @ApiBearerAuth()
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @Req() req: any) {
    if (req.user.id !== id && req.user.role !== Role.ADMIN) {
      throw new ForbiddenException('无权查看其他用户的详细信息');
    }
    return this.userService.findOne(id);
  }

  /**
   * 更新用户信息
   * PATCH /users/:id
   */
  @ApiBearerAuth()
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string, 
    @Body() updateUserDto: UpdateUserDto, 
    @Req() req: any
  ) {
    // Service 内部会二次校验：只能改自己，或管理员改任何人
    return this.userService.update(id, updateUserDto, req.user);
  }

  /**
   * 删除用户 (软删除)
   * DELETE /users/:id
   */
  @ApiBearerAuth()
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @Req() req: any) {
    // Service 内部会二次校验：只能删自己，或管理员删任何人
    return this.userService.remove(id, req.user);
  }

  /**
   * 修改用户角色 (仅管理员)
   * PATCH /users/:id/role
   */
  @ApiBearerAuth()
  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateRole(
    @Param('id') id: string, 
    @Body('role') role: Role, 
    @Req() req: any
  ) {
    return this.userService.updateRole(id, role, req.user);
  }
}