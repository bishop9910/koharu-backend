// src/entities/avatar.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity.js';

@Entity('avatars')
export class Avatar {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  path: string; // 相对路径，例如: /avatars/xxx.jpg

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User, (user) => user.avatar, {
    onDelete: 'CASCADE', // 数据库层面：用户删除时，自动删除头像记录
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}