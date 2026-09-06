// src/enums/avatar-status.enum.ts
export enum AvatarStatus {
  PENDING = 'pending',    // 待审核 (默认)
  APPROVED = 'approved',  // 已通过 (成为当前头像)
  REJECTED = 'rejected',  // 已拒绝 (作废，回退到上一个头像)
}
