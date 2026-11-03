// src/album/album-reaction.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AlbumLike } from '../entities/album-like.entity.js';
import { AlbumFavorite } from '../entities/album-favorite.entity.js';

export interface AlbumReactionSummary {
  likeCount: number;
  favoriteCount: number;
  likedByMe: boolean;
  favoritedByMe: boolean;
}

function emptySummary(): AlbumReactionSummary {
  return { likeCount: 0, favoriteCount: 0, likedByMe: false, favoritedByMe: false };
}

/**
 * 图集点赞与收藏。
 *
 * 写操作幂等：重复点赞/收藏不会报错，也不会产生第二行（唯一约束兜底）；
 * 取消一个本来就不存在的点赞同样按成功处理，前端无需先查状态。
 */
@Injectable()
export class AlbumReactionService {
  constructor(
    @InjectRepository(AlbumLike)
    private readonly likeRepository: Repository<AlbumLike>,
    @InjectRepository(AlbumFavorite)
    private readonly favoriteRepository: Repository<AlbumFavorite>,
  ) {}

  async like(albumId: string, userId: string): Promise<AlbumReactionSummary> {
    const existing = await this.likeRepository.findOne({ where: { albumId, userId } });
    if (!existing) {
      try {
        await this.likeRepository.insert({ albumId, userId });
      } catch (error: any) {
        // 并发双击时唯一约束会抛 23505；结果与“已点赞”一致，直接吞掉
        if (error?.code !== '23505') throw error;
      }
    }
    return this.getOne(albumId, userId);
  }

  async unlike(albumId: string, userId: string): Promise<AlbumReactionSummary> {
    await this.likeRepository.delete({ albumId, userId });
    return this.getOne(albumId, userId);
  }

  async favorite(albumId: string, userId: string): Promise<AlbumReactionSummary> {
    const existing = await this.favoriteRepository.findOne({ where: { albumId, userId } });
    if (!existing) {
      try {
        await this.favoriteRepository.insert({ albumId, userId });
      } catch (error: any) {
        if (error?.code !== '23505') throw error;
      }
    }
    return this.getOne(albumId, userId);
  }

  async unfavorite(albumId: string, userId: string): Promise<AlbumReactionSummary> {
    await this.favoriteRepository.delete({ albumId, userId });
    return this.getOne(albumId, userId);
  }

  async getOne(albumId: string, userId?: string): Promise<AlbumReactionSummary> {
    const map = await this.getMany([albumId], userId);
    return map.get(albumId) ?? emptySummary();
  }

  /**
   * 批量取一页图集的点赞/收藏统计与当前用户状态。
   * 列表接口只需要 4 次聚合查询，避免 N+1。
   */
  async getMany(albumIds: string[], userId?: string): Promise<Map<string, AlbumReactionSummary>> {
    const result = new Map<string, AlbumReactionSummary>();
    for (const albumId of albumIds) result.set(albumId, emptySummary());
    if (albumIds.length === 0) return result;

    const likeRows: { albumId: string; count: string }[] = await this.likeRepository
      .createQueryBuilder('albumLike')
      .select('albumLike.albumId', 'albumId')
      .addSelect('COUNT(*)', 'count')
      .where('albumLike.albumId IN (:...albumIds)', { albumIds })
      .groupBy('albumLike.albumId')
      .getRawMany();
    for (const row of likeRows) {
      const item = result.get(row.albumId);
      if (item) item.likeCount = Number(row.count);
    }

    const favoriteRows: { albumId: string; count: string }[] = await this.favoriteRepository
      .createQueryBuilder('albumFavorite')
      .select('albumFavorite.albumId', 'albumId')
      .addSelect('COUNT(*)', 'count')
      .where('albumFavorite.albumId IN (:...albumIds)', { albumIds })
      .groupBy('albumFavorite.albumId')
      .getRawMany();
    for (const row of favoriteRows) {
      const item = result.get(row.albumId);
      if (item) item.favoriteCount = Number(row.count);
    }

    if (userId) {
      const likedRows = await this.likeRepository.find({
        where: { albumId: In(albumIds), userId },
        select: { albumId: true },
      });
      for (const row of likedRows) {
        const item = result.get(row.albumId);
        if (item) item.likedByMe = true;
      }

      const favoritedRows = await this.favoriteRepository.find({
        where: { albumId: In(albumIds), userId },
        select: { albumId: true },
      });
      for (const row of favoritedRows) {
        const item = result.get(row.albumId);
        if (item) item.favoritedByMe = true;
      }
    }

    return result;
  }
}
