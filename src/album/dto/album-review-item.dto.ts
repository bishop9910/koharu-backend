// src/album/dto/album-review-item.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { AlbumSummaryDto } from './album-response.dto.js';
import { AlbumReportBriefDto } from './album-report-response.dto.js';

/** 待评审名单条目：图集摘要 + 待审图片数 + 已核实的举报 */
export class AlbumReviewItemDto extends AlbumSummaryDto {
  @ApiProperty({ description: '图集内当前仍为待审核状态的图片数量' })
  pendingImageCount: number;

  @ApiProperty({ description: '已核实、促成这次评审的举报', type: [AlbumReportBriefDto] })
  reports: AlbumReportBriefDto[];
}
