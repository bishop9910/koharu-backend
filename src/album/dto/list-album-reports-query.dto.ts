// src/album/dto/list-album-reports-query.dto.ts
import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportStatus } from '../../enums/report-status.enum.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListAlbumReportsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '按举报状态筛选', enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}
