import fs from 'fs';
import path from 'path';
import { loadDb } from './db';

const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

export function ensureBackupDir(): string {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  return BACKUP_DIR;
}

export function performGeneralBackup(reason: string = 'manual'): {
  success: boolean;
  filename: string;
  filepath: string;
  sizeBytes: number;
  timestamp: string;
} {
  ensureBackupDir();
  const db = loadDb();
  const now = new Date();
  const timestamp = now.toISOString();
  const dateFormatted = timestamp.replace(/[:.]/g, '-');
  const filename = `general-backup-${dateFormatted}.json`;
  const filepath = path.join(BACKUP_DIR, filename);
  const latestPath = path.join(BACKUP_DIR, 'general_backup_latest.json');

  const payload = {
    metadata: {
      appName: 'Hossidev Water Monitor SCADA',
      condominium: db.systemConfig?.condominiumName || 'Condomínio Residencial Kizomba',
      version: '2.5.0-PROD',
      reason,
      exportedAt: timestamp,
      totalUsers: db.users?.length || 0,
      totalTanks: Object.keys(db.currentTanks || {}).length,
      totalTelemetryRecords: db.telemetryHistory?.length || 0,
      totalLogs: db.logs?.length || 0,
    },
    systemConfig: db.systemConfig,
    users: db.users,
    currentTanks: db.currentTanks,
    nodes: db.nodes,
    telemetryHistory: db.telemetryHistory,
    logs: db.logs,
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  fs.writeFileSync(filepath, jsonStr, 'utf-8');
  fs.writeFileSync(latestPath, jsonStr, 'utf-8');

  // Keep last 15 backups to avoid disk bloat
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('general-backup-') && f.endsWith('.json'))
      .sort();
    if (files.length > 15) {
      const toRemove = files.slice(0, files.length - 15);
      for (const file of toRemove) {
        fs.unlinkSync(path.join(BACKUP_DIR, file));
      }
    }
  } catch (err) {
    console.error('Error pruning old backups:', err);
  }

  const stat = fs.statSync(filepath);

  return {
    success: true,
    filename,
    filepath,
    sizeBytes: stat.size,
    timestamp,
  };
}
