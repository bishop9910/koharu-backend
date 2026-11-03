// src/enums/album-review-status.enum.ts
export enum AlbumReviewStatus {
  NONE = 'none',         // 未进入评审流程
  PENDING = 'pending',   // 已核实举报，等待审核员整集评审
  APPROVED = 'approved', // 评审通过
  REJECTED = 'rejected', // 评审未通过，需要所有者重新提交
}
