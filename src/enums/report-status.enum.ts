// src/enums/report-status.enum.ts
export enum ReportStatus {
  PENDING = 'pending',     // 待审核员核实
  VERIFIED = 'verified',   // 已核实，图集已加入待评审名单
  DISMISSED = 'dismissed', // 核实后认为举报不成立
  RESOLVED = 'resolved',   // 图集评审已结束，举报结案
}
