// src/library/library.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { LibraryService } from './library.service.js';
import { ChangeLibraryPasswordDto, UnlockLibraryDto } from './dto/change-library-password.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { MinRole, MinRoleGuard } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';

const statusSchema = {
  type: 'object',
  properties: {
    bootstrapped: { type: 'boolean', description: '是否已经初始化图库密码' },
    unlocked: { type: 'boolean', description: '服务端当前是否持有可用数据密钥' },
    activeVersion: { type: 'number', description: '当前活跃的数据密钥版本' },
    rotation: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['idle', 'running', 'failed'], description: '密钥轮转状态' },
        total: { type: 'number', description: '需要重加密的文件总数' },
        done: { type: 'number', description: '已重加密的文件数' },
        error: { type: 'string', nullable: true, description: '失败原因' },
      },
    },
  },
};

@ApiTags('library')
@Controller('library')
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  /**
   * 图库加密状态
   * GET /library/status
   */
  @Get('status')
  @ApiOperation({
    summary: '图库加密状态',
    description:
      '公开接口。返回图库密码是否已初始化、服务端当前是否已解锁，以及改密码后的后台重加密进度。' +
      '前端可在改密码后轮询它来显示「正在重加密 x/y」。',
  })
  @ApiOkResponse({ description: '图库状态', schema: statusSchema })
  getStatus() {
    return this.libraryService.getStatus();
  }

  /**
   * 修改图库密码
   * POST /library/password
   */
  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.ADMIN)
  @ApiOperation({
    summary: '修改图库密码 (管理员及以上)',
    description:
      '只有 admin / super_admin 能改。修改成功后立即生成新一代数据密钥并在后台把全部图片重加密成新密钥；' +
      '重加密期间服务保持可用，进度见 GET /library/status。旧密码立即失效，新密码同时写入 adminInfo/info.json。',
  })
  @ApiOkResponse({
    description: '密码已更新，重加密已在后台开始',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: '图库密码已更新，图片正在后台重加密（期间服务可用）' },
        activeVersion: { type: 'number', example: 2 },
        rotationTotal: { type: 'number', description: '需要重加密的图片数量', example: 128 },
      },
    },
  })
  @ApiBadRequestResponse({ description: '原图库密码不正确，或新密码与原密码相同 / 长度不足 8 位' })
  @ApiUnauthorizedResponse({ description: '未登录或 Access Token 无效' })
  @ApiForbiddenResponse({ description: '权限不足：需要 ADMIN 及以上角色' })
  changePassword(@Body() dto: ChangeLibraryPasswordDto) {
    return this.libraryService.changePassword(dto.oldPassword, dto.newPassword);
  }

  /**
   * 手动解锁图库
   * POST /library/unlock
   */
  @Post('unlock')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.ADMIN)
  @ApiOperation({
    summary: '手动解锁图库 (管理员及以上)',
    description:
      '正常情况下服务启动时会用 adminInfo/info.json 里的图库密码自动解锁；只有密码文件缺失或被删时才需要手动解锁。' +
      '锁定期间任何图片的读取、缩略图生成与上传都会返回 503。',
  })
  @ApiOkResponse({ description: '解锁成功，返回最新状态', schema: statusSchema })
  @ApiBadRequestResponse({ description: '图库密码错误' })
  @ApiUnauthorizedResponse({ description: '未登录或 Access Token 无效' })
  @ApiForbiddenResponse({ description: '权限不足：需要 ADMIN 及以上角色' })
  unlock(@Body() dto: UnlockLibraryDto) {
    return this.libraryService.unlock(dto.password);
  }
}
