// src/album/dto/handle-album-report.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class HandleAlbumReportDto {
  @ApiPropertyOptional({ description: '处理说明（核实/驳回理由）', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
