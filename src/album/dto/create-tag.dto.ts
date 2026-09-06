// src/album/dto/create-tag.dto.ts
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({ description: '标签名 (唯一)', example: '风景' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;
}
