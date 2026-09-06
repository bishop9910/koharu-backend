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
import { AlbumVisibility } from '../enums/album-visibility.enum.js';
import { ImageStatus } from '../enums/image-status.enum.js';
import { Role } from '../enums/role.enum.js';
import { canManageTarget, isStaff, isAtLeast } from '../common/utils/role.util.js';
import { CreateAlbumDto } from './dto/create-album.dto.js';
import { UpdateAlbumDto } from './dto/update-album.dto.js';
import { ListAlbumsQueryDto } from './dto/list-albums-query.dto.js';
import { SearchAlbumsQueryDto } from './dto/search-albums-query.dto.js';

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
    return this.toDetailDto(await this.loadDetail(saved.id));
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

    return {
      data: albums.map((a) => this.toSummaryDto(a)),
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

    return {
      data: albums.map((a) => this.toSummaryDto(a)),
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
    return this.toDetailDto(album);
  }

  async update(id: string, dto: UpdateAlbumDto, currentUser: any) {
    const album = await this.albumRepository.findOne({
      where: { id },
      relations: { owner: true, tags: true },
    });
    if (!album) throw new NotFoundException('图集不存在');

    const isOwner = await this.assertCanEdit(album, currentUser);

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

    const saved = await this.albumRepository.save(album);
    return this.toDetailDto(await this.loadDetail(saved.id));
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
    const saved = await this.albumRepository.save(album);
    this.logger.log(`管理员 ${currentUser.id} 解锁图集 ${id}`);
    return this.toDetailDto(await this.loadDetail(saved.id));
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
    album.images = [...album.images, ...newImages];

    const saved = await this.albumRepository.save(album);
    return this.toDetailDto(await this.loadDetail(saved.id));
  }

  async removeImages(id: string, imageIds: string[], currentUser: any) {
    const album = await this.albumRepository.findOne({
      where: { id },
      relations: { owner: true, images: true },
    });
    if (!album) throw new NotFoundException('图集不存在');

    await this.assertCanEdit(album, currentUser);

    album.images = album.images.filter((i) => !imageIds.includes(i.id));

    const saved = await this.albumRepository.save(album);
    return this.toDetailDto(await this.loadDetail(saved.id));
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
    if (currentUser) {
      qb.where('(album.visibility = :pub OR album.ownerId = :uid)', {
        pub: AlbumVisibility.PUBLIC,
        uid: currentUser.id,
      });
    } else {
      qb.where('album.visibility = :pub', { pub: AlbumVisibility.PUBLIC });
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

  private toSummaryDto(album: any) {
    return {
      id: album.id,
      title: album.title,
      description: album.description,
      visibility: album.visibility,
      locked: album.locked,
      ownerId: album.ownerId,
      owner: album.owner ? { id: album.owner.id, username: album.owner.username } : null,
      tags: (album.tags ?? []).map((t: Tag) => ({ id: t.id, name: t.name })),
      imageCount: album.imageIds?.length ?? 0,
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
    };
  }

  private toDetailDto(album: Album) {
    return {
      id: album.id,
      title: album.title,
      description: album.description,
      visibility: album.visibility,
      locked: album.locked,
      ownerId: album.ownerId,
      owner: album.owner ? { id: album.owner.id, username: album.owner.username } : null,
      tags: (album.tags ?? []).map((t) => ({ id: t.id, name: t.name })),
      images: (album.images ?? []).map((i) => ({
        id: i.id,
        filename: i.filename,
        thumbnailPath: i.thumbnailPath,
        status: i.status,
      })),
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
    };
  }
}
