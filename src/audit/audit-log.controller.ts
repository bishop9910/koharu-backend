// src/audit/audit-log.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service.js';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { MinRoleGuard, MinRole } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';

@ApiTags('audit-logs')
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.ADMIN)
  @ApiOperation({ summary: '分页查询操作日志', description: '仅管理员及以上角色可访问，支持按操作者、动作、时间范围过滤' })
  @ApiOkResponse({
    description: '操作日志分页列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } },
        total: { type: 'number', example: 320 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 16 },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '权限不足：需要 ADMIN 及以上角色' })
  async findAll(@Query() query: ListAuditLogsQueryDto) {
    return this.auditLogService.findAll(query);
  }
}
