// src/album/dto/album-report-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlbumVisibility } from '../../enums/album-visibility.enum.js';
import { AlbumReviewStatus } from '../../enums/album-review-status.enum.js';
import { ReportStatus } from '../../enums/report-status.enum.js';

export class AlbumReportReporterDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  username: string;
}

export class AlbumReportAlbumDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: AlbumVisibility })
  visibility: AlbumVisibility;

  @ApiProperty({ enum: AlbumReviewStatus })
  reviewStatus: AlbumReviewStatus;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  ownerId: string | null;

  @ApiProperty({ nullable: true, type: String })
  ownerUsername: string | null;
}

/** 待评审列表中展示的举报摘要（不带图集详情，避免重复嵌套） */
export class AlbumReportBriefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  reason: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  detail: string | null;

  @ApiProperty({ enum: ReportStatus })
  status: ReportStatus;

  @ApiProperty({ type: AlbumReportReporterDto, nullable: true })
  reporter: AlbumReportReporterDto | null;

  @ApiProperty()
  createdAt: Date;
}

export class AlbumReportItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  albumId: string;

  @ApiProperty({ type: AlbumReportAlbumDto })
  album: AlbumReportAlbumDto;

  @ApiProperty({ type: AlbumReportReporterDto, nullable: true })
  reporter: AlbumReportReporterDto | null;

  @ApiProperty()
  reason: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  detail: string | null;

  @ApiProperty({ enum: ReportStatus })
  status: ReportStatus;

  @ApiPropertyOptional({ nullable: true, type: String })
  handledBy: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  handledAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  resolutionNote: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
