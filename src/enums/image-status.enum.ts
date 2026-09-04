// src/enums/image-status.enum.ts
export enum ImageStatus {
  PENDING = 'pending',    // 待审核 (默认)
  APPROVED = 'approved',  // 已通过 (公开可见)
  REJECTED = 'rejected',  // 已拒绝 (等待删除或一次申诉[可修改])
}