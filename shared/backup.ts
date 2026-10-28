export const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
export type BackupCounts = Record<string, number>;
export type RecoveryPoint = {
  id: string;
  createdAt: string;
  operations: string[];
  counts: BackupCounts;
};
export type RestorePreview = {
  id: string;
  filename: string;
  backupDate: string | null;
  expiresAt: string;
  operations: string[];
  counts: BackupCounts;
  currentCounts: BackupCounts;
  files: number;
  expectedState: string;
};
export type RestoreResult = { generation: string; recoveryPointId: string };
