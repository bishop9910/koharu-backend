// src/album/album.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Album } from '../entities/album.entity.js';
import { Tag } from '../entities/tag.entity.js';
import { Image } from '../entities/image.entity.js';
import { User } from '../entities/user.entity.js';
import { AlbumReport } from '../entities/album-report.entity.js';
import { AlbumVisibility } from '../enums/album-visibility.enum.js';
import { AlbumReviewStatus } from '../enums/album-review-status.enum.js';
import { ReportStatus } from '../enums/report-status.enum.js';
import { ImageStatus } from '../enums/image-status.enum.js';
import { Role } from '../enums/role.enum.js';
import { canManageTarget, isStaff, isAtLeast } from '../common/utils/role.util.js';
import { API_PREFIX } from '../common/constants.js';
import { ReviewExemptionService } from '../review/review-exemption.service.js';
import { AlbumReactionService } from './album-reaction.service.js';
import type { AlbumReactionSummary } from './album-reaction.service.js';
import { CreateAlbumDto } from './dto/create-album.dto.js';
import { UpdateAlbumDto } from './dto/update-album.dto.js';
import { ListAlbumsQueryDto } from './dto/list-albums-query.dto.js';
import { SearchAlbumsQueryDto } from './dto/search-albums-query.dto.js';
import { ReviewAlbumDto } from './dto/review-album.dto.js';
import { AlbumReactionDto } from './dto/album-reaction.dto.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';

const EMPTY_REACTION: AlbumReactionSummary = {
  likeCount: 0,
  favoriteCount: 0,
  likedByMe: false,
  favoritedByMe: false,
};

@Injectable()
export class AlbumService {
  private readonly logger = new Logger(AlbumService.name);

  constructor(
    @InjectRepository(Album)
    private albumRepository: Repository<Album>,
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
    @InjectRepository(Image)
    private imageRepository: Repository<Image>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AlbumReport)
    private reportRepository: Repository<AlbumReport>,
    private reactionService: AlbumReactionService,
    private reviewExemption: ReviewExemptionService,
  ) {}

  async create(dto: CreateAlbumDto, currentUser: any) {
    const tags = await this.resolveTags(dto.tags ?? []);

    const album = this.albumRepository.create({
      title: dto.title,
      description: dto.description ?? null,
      visibility: dto.visibility ?? AlbumVisibility.PUBLIC,
      ownerId: currentUser.id,
      locked: false,
      tags,
    });

    const saved = await this.albumRepository.save(album);
    this.logger.log(`用户 ${currentUser.id} 创建图集: ${saved.id}`);
    return this.detailDto(await this.loadDetail(saved.id), currentUser);
  }

  async findAll(query: ListAlbumsQueryDto, currentUser: any) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const totalQb = this.albumRepository.createQueryBuilder('album');
    this.applyVisibility(totalQb, currentUser);
    const total = await totalQb.getCount();

    const qb = this.albumRepository.createQueryBuilder('album')
      .leftJoinAndSelect('album.tags', 'tag')
      .leftJoinAndSelect('album.owner', 'owner')
      .loadRelationIdAndMap('album.imageIds', 'album.images');
    this.applyVisibility(qb, currentUser);

    const albums = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('album.createdAt', 'DESC')
      .getMany();

    const reactions = await this.reactionService.getMany(
      albums.map((a) => a.id),
      currentUser?.id,
    );

    return {
      data: albums.map((a) => this.toSummaryDto(a, reactions.get(a.id))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async search(query: SearchAlbumsQueryDto, currentUser: any) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    let tagAlbumIds: string[] | null = null;
    if (query.tags && query.tags.length > 0) {
      const tagRows = await this.albumRepository.createQueryBuilder('album')
        .innerJoin('album.tags', 't')
        .where('t.name IN (:...tags)', { tags: query.tags })
        .groupBy('album.id')
        .having('COUNT(DISTINCT t.id) = :tagCount', { tagCount: query.tags.length })
        .select('album.id', 'id')
        .getRawMany();
      tagAlbumIds = tagRows.map((r) => r.id);
      if (tagAlbumIds.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
    }

    const totalQb = this.albumRepository.createQueryBuilder('album');
    this.applyVisibility(totalQb, currentUser);
    if (query.q) {
      totalQb.andWhere('(album.title ILIKE :q OR album.description ILIKE :q)', { q: `%${query.q}%` });
    }
    if (tagAlbumIds) {
      totalQb.andWhere('album.id IN (:...tagAlbumIds)', { tagAlbumIds });
    }
    const total = await totalQb.getCount();

    const qb = this.albumRepository.createQueryBuilder('album')
      .leftJoinAndSelect('album.tags', 'tag')
      .leftJoinAndSelect('album.owner', 'owner')
      .loadRelationIdAndMap('album.imageIds', 'album.images');
    this.applyVisibility(qb, currentUser);
    if (query.q) {
      qb.andWhere('(album.title ILIKE :q OR album.description ILIKE :q)', { q: `%${query.q}%` });
    }
    if (tagAlbumIds) {
      qb.andWhere('album.id IN (:...tagAlbumIds)', { tagAlbumIds });
    }

    const albums = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('album.createdAt', 'DESC')
      .getMany();

    const reactions = await this.reactionService.getMany(
      albums.map((a) => a.id),
      currentUser?.id,
    );

    return {
      data: albums.map((a) => this.toSummaryDto(a, reactions.get(a.id))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, currentUser: any) {
    const album = await this.loadDetail(id);
    if (album.visibility === AlbumVisibility.PRIVATE
      && album.ownerId !== currentUser?.id
      && !isStaff(currentUser?.role)) {
      throw new NotFoundException('图集不存在');
    }
    return this.detailDto(album, currentUser);
  }

  async update(id: string, dto: UpdateAlbumDto, currentUser: any) {
    const album = await this.albumRepository.findOne({
      where: { id },
      relations: { owner: true, tags: true },
    });
    if (!album) throw new NotFoundException('图集不存在');

    const isOwner = await this.assertCanEdit(album, currentUser);

    const hasChanges =
      dto.title !== undefined
      || dto.description !== undefined
      || dto.visibility !== undefined
      || dto.tags !== undefined;
    if (hasChanges) this.consumeReviewEdit(album, isOwner);

    if (dto.title !== undefined) album.title = dto.title;
    if (dto.description !== undefined) album.description = dto.description;
    if (dto.visibility !== undefined) {
      if (!isOwner && !isAtLeast(currentUser.role, Role.ADMIN)) {
        throw new ForbiddenException('仅管理员及以上可修改图集可见性');
      }
      album.visibility = dto.visibility;
      if (!isOwner) {
        album.locked = dto.visibility === AlbumVisibility.PRIVATE;
      }
    }
    if (dto.tags !== undefined) {
      album.tags = await this.resolveTags(dto.tags);
    }

    await this.albumRepository.save(album);
    return this.detailDto(await this.loadDetail(id), currentUser);
  }

  async unlock(id: string, currentUser: any) {
    const album = await this.albumRepository.findOne({
      where: { id },
      relations: { owner: true },
    });
    if (!album) throw new NotFoundException('图集不存在');

    if (!isAtLeast(currentUser.role, Role.ADMIN)) {
      throw new ForbiddenException('仅管理员及以上可解锁图集');
    }

    let ownerRole: Role | undefined = album.owner?.role;
    if (!ownerRole) {
      const owner = await this.userRepository.findOne({ where: { id: album.ownerId } });
      ownerRole = owner?.role;
    }
    if (!ownerRole || !canManageTarget(currentUser.role, ownerRole)) {
      throw new ForbiddenException('无权解锁该图集');
    }

    album.locked = false;
    album.visibility = AlbumVisibility.PUBLIC;
    await this.albumRepository.save(album);
    this.logger.log(`管理员 ${currentUser.id} 解锁图集 ${id}`);
    return this.detailDto(await this.loadDetail(id), currentUser);
  }

  async remove(id: string, currentUser: any): Promise<void> {
    const album = await this.albumRepository.findOne({
      where: { id },
      relations: { owner: true },
    });
    if (!album) throw new NotFoundException('图集不存在');

    await this.assertCanEdit(album, currentUser);

    await this.albumRepository.remove(album);
    this.logger.log(`图集 ${id} 已被删除`);
  }

  async addImages(id: string, imageIds: string[], currentUser: any) {
    const album = await this.albumRepository.findOne({
      where: { id },
      relations: { owner: true, images: true },
    });
    if (!album) throw new NotFoundException('图集不存在');

    const isOwner = await this.assertCanEdit(album, currentUser);

    const images = await this.imageRepository.find({ where: { id: In(imageIds) } });
    if (images.length !== imageIds.length) {
      throw new BadRequestException('部分图片不存在');
    }

    for (const image of images) {
      if (image.status !== ImageStatus.APPROVED) {
        throw new BadRequestException(`图片 ${image.id} 未过审，无法归档`);
      }
      if (isOwner && image.userId !== album.ownerId) {
        throw new BadRequestException(`图片 ${image.id} 不属于当前用户，无法归档`);
      }
    }

    const existingIds = new Set(album.images.map((i) => i.id));
    const newImages = images.filter((i) => !existingIds.has(i.id));
    if (newImages.length > 0) this.consumeReviewEdit(album, isOwner);
    album.images = [...album.images, ...newImages];

    await this.albumRepository.save(album);
    return this.detailDto(await this.loadDetail(id), currentUser);
  }

  async removeImages(id: string, imageIds: string[], currentUser: any) {
    const album = await this.albumRepository.findOne({
      where: { id },
      relations: { owner: true, images: true },
    });
    if (!album) throw new NotFoundException('图集不存在');

    const isOwner = await this.assertCanEdit(album, currentUser);

    const remainingImages = album.images.filter((i) => !imageIds.includes(i.id));
    if (remainingImages.length !== album.images.length) this.consumeReviewEdit(album, isOwner);
    album.images = remainingImages;

    await this.albumRepository.save(album);
    return this.detailDto(await this.loadDetail(id), currentUser);
  }

  async createTag(name: string): Promise<Tag> {
    const existing = await this.tagRepository.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException('标签已存在');
    }
    const tag = this.tagRepository.create({ name });
    return await this.tagRepository.save(tag);
  }

  async findAllTags(): Promise<Tag[]> {
    return await this.tagRepository.find({ order: { name: 'ASC' } });
  }

  async removeTag(id: string): Promise<void> {
    const tag = await this.tagRepository.findOne({ where: { id } });
    if (!tag) throw new NotFoundException('标签不存在');

    const albums = await this.albumRepository
      .createQueryBuilder('album')
      .leftJoinAndSelect('album.tags', 'tag')
      .where('tag.id = :tagId', { tagId: id })
      .getMany();

    for (const album of albums) {
      album.tags = album.tags.filter((t) => t.id !== id);
      await this.albumRepository.save(album);
    }

    await this.tagRepository.remove(tag);
    this.logger.log(`标签 ${tag.name} 已被删除`);
  }

  async removeAllByUser(userId: string): Promise<void> {
    const albums = await this.albumRepository.find({ where: { ownerId: userId } });
    for (const album of albums) {
      await this.albumRepository.remove(album);
    }
    this.logger.log(`已清理用户 ${userId} 的 ${albums.length} 个图集`);
  }

  private async resolveTags(names: string[]): Promise<Tag[]> {
    if (!names || names.length === 0) return [];
    const unique = [...new Set(names)];
    const tags = await this.tagRepository.find({ where: { name: In(unique) } });
    const found = new Set(tags.map((t) => t.name));
    const missing = unique.filter((n) => !found.has(n));
    if (missing.length > 0) {
      throw new BadRequestException(`标签不存在: ${missing.join(', ')}`);
    }
    return tags;
  }

  private async assertCanEdit(album: Album, currentUser: any): Promise<boolean> {
    const isOwner = album.ownerId === currentUser.id;
    if (isOwner) {
      if (album.locked) {
        throw new ForbiddenException('图集已被管理员锁定，无法修改');
      }
      return true;
    }

    let ownerRole: Role | undefined = album.owner?.role;
    if (!ownerRole) {
      const owner = await this.userRepository.findOne({ where: { id: album.ownerId } });
      ownerRole = owner?.role;
    }
    if (!ownerRole || !canManageTarget(currentUser.role, ownerRole)) {
      throw new ForbiddenException('无权修改该图集');
    }
    return false;
  }

  private applyVisibility(qb: any, currentUser: any) {
    if (isStaff(currentUser?.role)) return;
    // 用 andWhere：可见性只是筛选条件之一，调用方后续还会追加 title/tag 等 andWhere，
    // 用 where 会把已有条件整段覆盖掉。
    if (currentUser) {
      qb.andWhere('(album.visibility = :pub OR album.ownerId = :uid)', {
        pub: AlbumVisibility.PUBLIC,
        uid: currentUser.id,
      });
    } else {
      qb.andWhere('album.visibility = :pub', { pub: AlbumVisibility.PUBLIC });
    }
  }

  private async loadDetail(id: string): Promise<Album> {
    const album = await this.albumRepository.findOne({
      where: { id },
      relations: { owner: true, tags: true, images: true },
    });
    if (!album) throw new NotFoundException('图集不存在');
    return album;
  }

  async findFavorites(query: ListAlbumsQueryDto, currentUser: AuthenticatedUser) {
    return this.findAlbumsByReaction('favorites', query, currentUser);
  }

  async findLiked(query: ListAlbumsQueryDto, currentUser: AuthenticatedUser) {
    return this.findAlbumsByReaction('likes', query, currentUser);
  }

  async likeAlbum(id: string, currentUser: AuthenticatedUser): Promise<AlbumReactionDto> {
    await this.findVisibleAlbum(id, currentUser);
    const summary = await this.reactionService.like(id, currentUser.id);
    return { albumId: id, ...summary };
  }

  async unlikeAlbum(id: string, currentUser: AuthenticatedUser): Promise<AlbumReactionDto> {
    await this.findVisibleAlbum(id, currentUser);
    const summary = await this.reactionService.unlike(id, currentUser.id);
    return { albumId: id, ...summary };
  }

  async favoriteAlbum(id: string, currentUser: AuthenticatedUser): Promise<AlbumReactionDto> {
    await this.findVisibleAlbum(id, currentUser);
    const summary = await this.reactionService.favorite(id, currentUser.id);
    return { albumId: id, ...summary };
  }

  async unfavoriteAlbum(id: string, currentUser: AuthenticatedUser): Promise<AlbumReactionDto> {
    await this.findVisibleAlbum(id, currentUser);
    const summary = await this.reactionService.unfavorite(id, currentUser.id);
    return { albumId: id, ...summary };
  }

  async findPendingReviews(query: ListAlbumsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [albums, total] = await this.albumRepository.findAndCount({
      where: { reviewStatus: AlbumReviewStatus.PENDING },
      relations: { owner: true, tags: true, images: true },
      order: { reviewSubmittedAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const albumIds = albums.map((a) => a.id);
    const reactions = await this.reactionService.getMany(albumIds);

    const reports = albumIds.length
      ? await this.reportRepository.find({
          where: { albumId: In(albumIds), status: ReportStatus.VERIFIED },
          relations: { reporter: true },
          order: { createdAt: 'DESC' },
        })
      : [];
    const reportsByAlbum = new Map<string, AlbumReport[]>();
    for (const report of reports) {
      const list = reportsByAlbum.get(report.albumId) ?? [];
      list.push(report);
      reportsByAlbum.set(report.albumId, list);
    }

    return {
      data: albums.map((album) => ({
        ...this.toSummaryDto(album, reactions.get(album.id)),
        pendingImageCount: (album.images ?? []).filter(
          (image) => image.status === ImageStatus.PENDING,
        ).length,
        reports: (reportsByAlbum.get(album.id) ?? []).map((report) => ({
          id: report.id,
          reason: report.reason,
          detail: report.detail,
          status: report.status,
          reporter: report.reporter
            ? { id: report.reporter.id, username: report.reporter.username }
            : null,
          createdAt: report.createdAt,
        })),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async submitReview(id: string, currentUser: AuthenticatedUser) {
    const album = await this.albumRepository.findOne({ where: { id } });
    if (!album) throw new NotFoundException('图集不存在');
    if (album.ownerId !== currentUser.id) {
      throw new ForbiddenException('只有图集所有者可以提交评审');
    }
    if (album.reviewStatus === AlbumReviewStatus.PENDING) {
      throw new ConflictException('图集已在待评审名单中，请耐心等待审核');
    }
    if (album.reviewStatus !== AlbumReviewStatus.REJECTED) {
      throw new BadRequestException('只有被驳回的图集需要重新提交评审');
    }

    album.reviewStatus = AlbumReviewStatus.PENDING;
    album.reviewSubmittedAt = new Date();
    album.reviewRound += 1;
    album.reviewRejectReason = null;
    await this.albumRepository.save(album);
    this.logger.log(`图集 ${id} 重新提交评审`);
    return this.detailDto(await this.loadDetail(id), currentUser);
  }

  async reviewAlbum(
    id: string,
    dto: ReviewAlbumDto,
    currentUser: AuthenticatedUser,
  ) {
    if (
      dto.status !== AlbumReviewStatus.APPROVED
      && dto.status !== AlbumReviewStatus.REJECTED
    ) {
      throw new BadRequestException('评审结果只能是 approved 或 rejected');
    }
    const reason = dto.reason?.trim();
    if (dto.status === AlbumReviewStatus.REJECTED && !reason) {
      throw new BadRequestException('驳回图集时必须提供原因');
    }

    const album = await this.albumRepository.findOne({
      where: { id },
      relations: { owner: true, images: true },
    });
    if (!album) throw new NotFoundException('图集不存在');
    if (album.reviewStatus !== AlbumReviewStatus.PENDING) {
      throw new ConflictException('该图集不在待评审名单中');
    }

    const exempt = await this.reviewExemption.isSelfReviewExempt(
      currentUser.id,
      currentUser.role,
    );
    if (album.ownerId === currentUser.id && !exempt) {
      throw new ForbiddenException('不能审核自己的图集');
    }

    const pendingImages = (album.images ?? []).filter(
      (image) => image.status === ImageStatus.PENDING,
    );
    if (!exempt && pendingImages.some((image) => image.userId === currentUser.id)) {
      throw new ForbiddenException('待审图片中包含你自己上传的图片，无法整集审核');
    }

    const now = new Date();
    const result = await this.albumRepository.update(
      { id, reviewStatus: AlbumReviewStatus.PENDING },
      {
        reviewStatus: dto.status,
        reviewedBy: currentUser.id,
        reviewedAt: now,
        reviewRejectReason: dto.status === AlbumReviewStatus.REJECTED ? reason! : null,
      },
    );
    if (!result.affected) {
      throw new ConflictException('图集评审状态已被其他审核员变更，请刷新后重试');
    }

    if (pendingImages.length > 0) {
      await this.imageRepository.update(
        { id: In(pendingImages.map((image) => image.id)) },
        {
          status:
            dto.status === AlbumReviewStatus.APPROVED
              ? ImageStatus.APPROVED
              : ImageStatus.REJECTED,
          reviewedBy: currentUser.id,
          rejectReason: dto.status === AlbumReviewStatus.REJECTED ? reason! : null,
        },
      );
    }

    await this.reportRepository.update(
      { albumId: id, status: ReportStatus.VERIFIED },
      { status: ReportStatus.RESOLVED },
    );

    this.logger.log(`图集 ${id} 整集评审: ${dto.status}`);
    return {
      message:
        dto.status === AlbumReviewStatus.APPROVED ? '图集评审通过' : '图集评审未通过',
      approvedImages:
        dto.status === AlbumReviewStatus.APPROVED ? pendingImages.length : 0,
      rejectedImages:
        dto.status === AlbumReviewStatus.REJECTED ? pendingImages.length : 0,
      album: await this.detailDto(await this.loadDetail(id), currentUser),
    };
  }

  private async findAlbumsByReaction(
    relation: 'favorites' | 'likes',
    query: ListAlbumsQueryDto,
    currentUser: AuthenticatedUser,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const countQb = this.albumRepository
      .createQueryBuilder('album')
      .innerJoin(`album.${relation}`, 'reaction', 'reaction.userId = :userId', {
        userId: currentUser.id,
      });
    this.applyVisibility(countQb, currentUser);
    const total = await countQb.getCount();

    // 不能直接对实体分页并按 reaction.createdAt 排序：skip/take 会让 TypeORM 生成
    // distinctAlias 子查询，而 reaction.createdAt 是 join 别名、不在子查询列里，
    // 会报 `字段 distinctAlias.reaction_createdAt 不存在`。这里先取分页 id，再按 id 加载实体。
    const idQb = this.albumRepository
      .createQueryBuilder('album')
      .innerJoin(`album.${relation}`, 'reaction', 'reaction.userId = :userId', {
        userId: currentUser.id,
      })
      .select('album.id', 'id')
      .addSelect('reaction.createdAt', 'reactionCreatedAt');
    this.applyVisibility(idQb, currentUser);

    const rows = await idQb
      .orderBy('reaction.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany<{ id: string }>();
    const ids = rows.map((row) => row.id);

    let albums: Album[] = [];
    if (ids.length > 0) {
      const loaded = await this.albumRepository
        .createQueryBuilder('album')
        .leftJoinAndSelect('album.tags', 'tag')
        .leftJoinAndSelect('album.owner', 'owner')
        .loadRelationIdAndMap('album.imageIds', 'album.images')
        .where('album.id IN (:...ids)', { ids })
        .getMany();
      const byId = new Map(loaded.map((album) => [album.id, album]));
      albums = ids
        .map((id) => byId.get(id))
        .filter((album): album is Album => !!album);
    }

    const reactions = await this.reactionService.getMany(
      albums.map((a) => a.id),
      currentUser.id,
    );

    return {
      data: albums.map((a) => this.toSummaryDto(a, reactions.get(a.id))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async findVisibleAlbum(id: string, currentUser?: AuthenticatedUser) {
    const album = await this.albumRepository.findOne({
      where: { id },
      select: { id: true, visibility: true, ownerId: true },
    });
    if (!album) throw new NotFoundException('图集不存在');
    const isStaffViewer = !!currentUser && isStaff(currentUser.role);
    if (
      album.visibility === AlbumVisibility.PRIVATE
      && album.ownerId !== currentUser?.id
      && !isStaffViewer
    ) {
      throw new NotFoundException('图集不存在');
    }
    return album;
  }

  private consumeReviewEdit(album: Album, isOwner: boolean): void {
    if (!isOwner) return;
    if (album.reviewStatus === AlbumReviewStatus.PENDING) {
      album.reviewEditUsed = true;
      return;
    }
    if (album.reviewStatus === AlbumReviewStatus.REJECTED) {
      if (album.reviewEditUsed) {
        throw new ForbiddenException('本次评审的修改机会已用完，请重新提交评审');
      }
      album.reviewEditUsed = true;
    }
  }

  private async detailDto(album: Album, currentUser?: AuthenticatedUser) {
    const reaction = await this.reactionService.getOne(album.id, currentUser?.id);
    return this.toDetailDto(album, currentUser, reaction);
  }

  private toSummaryDto(album: any, reaction?: AlbumReactionSummary) {
    const stats = reaction ?? EMPTY_REACTION;
    return {
      id: album.id,
      title: album.title,
      description: album.description,
      visibility: album.visibility,
      locked: album.locked,
      ownerId: album.ownerId,
      owner: album.owner ? { id: album.owner.id, username: album.owner.username } : null,
      tags: (album.tags ?? []).map((t: Tag) => ({ id: t.id, name: t.name })),
      imageCount: album.imageIds?.length ?? album.images?.length ?? 0,
      ...stats,
      reviewStatus: album.reviewStatus,
      reviewEditUsed: album.reviewEditUsed,
      reviewSubmittedAt: album.reviewSubmittedAt,
      reviewRound: album.reviewRound,
      reviewedAt: album.reviewedAt,
      reviewRejectReason: album.reviewRejectReason,
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
    };
  }

  private toDetailDto(
    album: Album,
    currentUser?: any,
    reaction?: AlbumReactionSummary,
  ) {
    // 图集里的图片会因改稿重新回到待审核，游客与无关用户不应从图集里看到未过审的图片
    const canSeeAllImages =
      isStaff(currentUser?.role) || (!!currentUser?.id && currentUser.id === album.ownerId);
    const stats = reaction ?? EMPTY_REACTION;
    return {
      id: album.id,
      title: album.title,
      description: album.description,
      visibility: album.visibility,
      locked: album.locked,
      ownerId: album.ownerId,
      owner: album.owner ? { id: album.owner.id, username: album.owner.username } : null,
      tags: (album.tags ?? []).map((t) => ({ id: t.id, name: t.name })),
      images: (album.images ?? [])
        .filter((i) => canSeeAllImages || i.status === ImageStatus.APPROVED)
        .map((i) => ({
          id: i.id,
          filename: i.filename,
          thumbnailPath: i.thumbnailPath,
          thumbnailUrl: `/${API_PREFIX}/images/${i.id}/thumbnail`,
          status: i.status,
        })),
      ...stats,
      reviewStatus: album.reviewStatus,
      reviewEditUsed: album.reviewEditUsed,
      reviewSubmittedAt: album.reviewSubmittedAt,
      reviewRound: album.reviewRound,
      reviewedAt: album.reviewedAt,
      reviewRejectReason: album.reviewRejectReason,
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
    };
  }
}
