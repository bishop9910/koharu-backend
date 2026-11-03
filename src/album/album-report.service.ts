// src/album/album-report.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Album } from '../entities/album.entity.js';
import { AlbumReport } from '../entities/album-report.entity.js';
import { ReportStatus } from '../enums/report-status.enum.js';
import { AlbumReviewStatus } from '../enums/album-review-status.enum.js';
import { AlbumVisibility } from '../enums/album-visibility.enum.js';
import { isStaff } from '../common/utils/role.util.js';
import { CreateAlbumReportDto } from './dto/create-album-report.dto.js';
import { ListAlbumReportsQueryDto } from './dto/list-album-reports-query.dto.js';
import { HandleAlbumReportDto } from './dto/handle-album-report.dto.js';
import type { AlbumReportItemDto } from './dto/album-report-response.dto.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';

/**
 * 图集举报与审核员核实。
 *
 * 流程：
 *   1) 用户举报（PENDING）；
 *   2) 审核员核实（VERIFIED）→ 图集加入待评审名单，所有者获得一次修改机会；
 *      核实也可以改为驳回（DISMISSED）；
 *   3) 图集整集评审结束后，所有已核实举报自动结案（RESOLVED）。
 */
@Injectable()
export class AlbumReportService {
  private readonly logger = new Logger(AlbumReportService.name);

  constructor(
    @InjectRepository(AlbumReport)
    private readonly reportRepository: Repository<AlbumReport>,
    @InjectRepository(Album)
    private readonly albumRepository: Repository<Album>,
  ) {}

  async createReport(
    albumId: string,
    dto: CreateAlbumReportDto,
    currentUser: AuthenticatedUser,
  ): Promise<{ message: string; report: AlbumReportItemDto }> {
    const album = await this.albumRepository.findOne({
      where: { id: albumId },
      relations: { owner: true },
    });
    if (!album) throw new NotFoundException('图集不存在');

    if (
      album.visibility === AlbumVisibility.PRIVATE
      && album.ownerId !== currentUser.id
      && !isStaff(currentUser.role)
    ) {
      throw new NotFoundException('图集不存在');
    }
    if (album.ownerId === currentUser.id) {
      throw new BadRequestException('不能举报自己的图集');
    }

    const existing = await this.reportRepository.findOne({
      where: {
        albumId,
        reporterId: currentUser.id,
        status: In([ReportStatus.PENDING, ReportStatus.VERIFIED]),
      },
    });
    if (existing) {
      throw new ConflictException('你已举报过该图集，请等待审核员处理');
    }

    const report = this.reportRepository.create({
      albumId,
      reporterId: currentUser.id,
      reason: dto.reason,
      detail: dto.detail ?? null,
      status: ReportStatus.PENDING,
    });
    const saved = await this.reportRepository.save(report);
    this.logger.log(`用户 ${currentUser.id} 举报图集 ${albumId}: ${dto.reason}`);

    return {
      message: '举报已提交，等待审核员核实',
      report: await this.loadItem(saved.id),
    };
  }

  async list(query: ListAlbumReportsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.reportRepository.createQueryBuilder('report')
      .leftJoinAndSelect('report.album', 'album')
      .leftJoinAndSelect('album.owner', 'owner')
      .leftJoinAndSelect('report.reporter', 'reporter');

    if (query.status) {
      qb.andWhere('report.status = :status', { status: query.status });
    }

    const [reports, total] = await qb
      .orderBy('report.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: reports.map((report) => this.toItem(report)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<AlbumReportItemDto> {
    return this.loadItem(id);
  }

  /**
   * 核实举报：举报置为 verified，图集加入待评审名单。
   * 若图集已在待评审名单中，不重置本轮修改机会与轮次，避免反复核实刷机会。
   */
  async verify(
    id: string,
    dto: HandleAlbumReportDto,
    currentUser: AuthenticatedUser,
  ): Promise<{ message: string; report: AlbumReportItemDto }> {
    const report = await this.findReportWithAlbum(id);
    if (report.status !== ReportStatus.PENDING) {
      throw new ConflictException('该举报已被处理');
    }

    const now = new Date();
    const result = await this.reportRepository.update(
      { id, status: ReportStatus.PENDING },
      {
        status: ReportStatus.VERIFIED,
        handledBy: currentUser.id,
        handledAt: now,
        resolutionNote: dto.note ?? null,
      },
    );
    if (!result.affected) {
      throw new ConflictException('该举报已被其他审核员处理');
    }

    const album = report.album;
    if (album) {
      const moved = await this.albumRepository.update(
        { id: album.id, reviewStatus: Not(AlbumReviewStatus.PENDING) },
        {
          reviewStatus: AlbumReviewStatus.PENDING,
          reviewEditUsed: false,
          reviewSubmittedAt: now,
          reviewRound: () => '"reviewRound" + 1',
          reviewedBy: null,
          reviewedAt: null,
          reviewRejectReason: null,
        },
      );
      if (moved.affected) {
        this.logger.log(`举报 ${id} 核实通过，图集 ${album.id} 加入待评审名单`);
      } else {
        this.logger.log(`举报 ${id} 核实通过，图集 ${report.albumId} 已在待评审名单中`);
      }
    }

    return { message: '举报已核实，图集已加入待评审名单', report: await this.loadItem(id) };
  }

  async dismiss(
    id: string,
    dto: HandleAlbumReportDto,
    currentUser: AuthenticatedUser,
  ): Promise<{ message: string; report: AlbumReportItemDto }> {
    await this.findReportWithAlbum(id);

    const result = await this.reportRepository.update(
      { id, status: ReportStatus.PENDING },
      {
        status: ReportStatus.DISMISSED,
        handledBy: currentUser.id,
        handledAt: new Date(),
        resolutionNote: dto.note ?? null,
      },
    );
    if (!result.affected) {
      throw new ConflictException('该举报已被处理');
    }

    this.logger.log(`审核员 ${currentUser.id} 驳回举报 ${id}`);
    return { message: '举报已驳回', report: await this.loadItem(id) };
  }

  private async findReportWithAlbum(id: string): Promise<AlbumReport> {
    const report = await this.reportRepository.findOne({
      where: { id },
      relations: { album: true, reporter: true },
    });
    if (!report) throw new NotFoundException('举报不存在');
    return report;
  }

  private async loadItem(id: string): Promise<AlbumReportItemDto> {
    const report = await this.reportRepository.findOne({
      where: { id },
      relations: { album: { owner: true }, reporter: true },
    });
    if (!report) throw new NotFoundException('举报不存在');
    return this.toItem(report);
  }

  private toItem(report: AlbumReport): AlbumReportItemDto {
    const album = report.album;
    return {
      id: report.id,
      albumId: report.albumId,
      album: {
        id: album.id,
        title: album.title,
        visibility: album.visibility,
        reviewStatus: album.reviewStatus,
        ownerId: album.ownerId,
        ownerUsername: album.owner?.username ?? null,
      },
      reporter: report.reporter
        ? { id: report.reporter.id, username: report.reporter.username }
        : null,
      reason: report.reason,
      detail: report.detail,
      status: report.status,
      handledBy: report.handledBy,
      handledAt: report.handledAt,
      resolutionNote: report.resolutionNote,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }
}
