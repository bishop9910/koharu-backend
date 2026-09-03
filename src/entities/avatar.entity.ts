// src/entities/avatar.entity.ts
import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn,
  OneToOne,
  JoinColumn
} from 'typeorm';
import { User } from './user.entity.js';

@Entity('avatars')
export class Avatar {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  path: string; // 头像文件路径/URL/hash

  @Column({ unique: true }) // 一个头像只属于一个用户
  userId: string;

  @OneToOne(() => User, (user) => user.avatar, {
    onDelete: 'CASCADE', // 用户删除时，头像也删除
  })
  @JoinColumn({ name: 'userId' }) // 指定外键字段名
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}