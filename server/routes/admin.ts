import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { loadDb, saveDb, saveUsersDurable, restoreDb, getDbStats, UserRecord } from '../db';
import { authMiddleware, requireAdmin, AuthRequest } from '../auth';
import { performGeneralBackup } from '../backupService';

const router = Router();

// Apply auth & admin middleware to all routes in this router
router.use(authMiddleware, requireAdmin);

// GET /api/admin/users
router.get('/users', (_req, res) => {
  const db = loadDb();
  const safeUsers = db.users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    permittedTankIds: u.permittedTankIds,
    active: u.active !== false,
    permissions: u.permissions || (u.role === 'admin' ? ['*'] : ['tanks:read', 'telemetry:read']),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt || u.createdAt,
    createdBy: u.createdBy || null,
    lastLogin: u.lastLogin,
    lastLoginAt: u.lastLoginAt || u.lastLogin || null,
  }));

  res.json({ users: safeUsers });
});

// POST /api/admin/users
router.post('/users', (req: AuthRequest, res) => {
  const { username, name, email, password, role, permittedTankIds, active, permissions } = req.body;

  if (!username || !password || !email) {
    return res.status(400).json({ error: 'Preencha usuário, e-mail e senha.' });
  }

  const db = loadDb();
  const cleanUsername = String(username).trim().toLowerCase();
  const cleanEmail = String(email).trim().toLowerCase();

  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: 'O nome de usuário deve ter pelo menos 3 caracteres.' });
  }

  if (db.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
    return res.status(400).json({ error: 'Nome de usuário já existente.' });
  }

  if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    return res.status(400).json({ error: 'E-mail já existente.' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ error: 'A senha deve possuir no mínimo 6 caracteres.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(String(password).trim(), salt);
  const nowIso = new Date().toISOString();
  const userRole = role === 'admin' ? 'admin' : 'user';
  const userPerms = Array.isArray(permissions) ? permissions : (userRole === 'admin' ? ['*'] : ['tanks:read', 'telemetry:read']);

  const newUser: UserRecord = {
    id: crypto.randomUUID(),
    username: cleanUsername,
    name: name?.trim() || cleanUsername,
    email: cleanEmail,
    passwordHash,
    role: userRole,
    active: active !== false,
    permissions: userPerms,
    permittedTankIds: Array.isArray(permittedTankIds) ? permittedTankIds : [1, 2, 3, 4, 5, 6],
    createdBy: req.user?.username || 'admin',
    createdAt: nowIso,
    updatedAt: nowIso,
    lastLoginAt: null,
  };

  db.users.push(newUser);

  db.logs.push({
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString(),
    type: 'system',
    text: `Usuário "${newUser.username}" (${newUser.role}) criado pelo administrador ${req.user?.username}.`,
  });

  saveUsersDurable(db.users);

  res.status(201).json({
    success: true,
    message: 'Usuário cadastrado com sucesso!',
    user: {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      active: newUser.active,
      permissions: newUser.permissions,
      permittedTankIds: newUser.permittedTankIds,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
      createdBy: newUser.createdBy,
    },
  });
});

// PUT /api/admin/users/:id - Edit ALL data of an existing user
router.put('/users/:id', (req: AuthRequest, res) => {
  const { id } = req.params;
  const { username, name, email, role, permittedTankIds, password, active, permissions } = req.body;

  const db = loadDb();
  const user = db.users.find((u) => u.id === id);

  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  // If username is changing, check uniqueness
  if (username !== undefined) {
    const cleanUsername = String(username).trim().toLowerCase();
    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'O nome de usuário deve ter pelo menos 3 caracteres.' });
    }
    const usernameConflict = db.users.find((u) => u.id !== id && u.username.toLowerCase() === cleanUsername);
    if (usernameConflict) {
      return res.status(400).json({ error: 'Nome de usuário já está em uso por outra conta.' });
    }
    user.username = cleanUsername;
  }

  // If email is changing, check uniqueness
  if (email !== undefined) {
    const cleanEmail = String(email).trim().toLowerCase();
    const emailConflict = db.users.find((u) => u.id !== id && u.email.toLowerCase() === cleanEmail);
    if (emailConflict) {
      return res.status(400).json({ error: 'E-mail já cadastrado para outra conta.' });
    }
    user.email = cleanEmail;
  }

  if (name !== undefined) {
    user.name = String(name).trim() || user.username;
  }

  // If role is changing, prevent demoting the only admin
  if (role !== undefined) {
    if (user.role === 'admin' && role !== 'admin') {
      const activeAdminCount = db.users.filter((u) => u.role === 'admin' && u.active !== false).length;
      if (activeAdminCount <= 1) {
        return res.status(400).json({ error: 'Não é possível alterar o único administrador do sistema para usuário comum.' });
      }
    }
    user.role = role === 'admin' ? 'admin' : 'user';
  }

  // Prevent deactivating the only active admin
  if (active !== undefined) {
    if (user.role === 'admin' && active === false) {
      const activeAdminCount = db.users.filter((u) => u.role === 'admin' && u.active !== false).length;
      if (activeAdminCount <= 1) {
        return res.status(400).json({ error: 'Não é possível desativar o único administrador ativo do sistema.' });
      }
    }
    user.active = Boolean(active);
  }

  if (Array.isArray(permissions)) {
    user.permissions = permissions;
  }

  if (Array.isArray(permittedTankIds)) {
    user.permittedTankIds = permittedTankIds;
  }

  // If password provided and not empty
  if (password && String(password).trim().length >= 6) {
    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(String(password).trim(), salt);
  }

  user.updatedAt = new Date().toISOString();

  db.logs.push({
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString(),
    type: 'system',
    text: `Dados do usuário "${user.username}" atualizados pelo administrador ${req.user?.username}.`,
  });

  saveUsersDurable(db.users);

  res.json({
    success: true,
    message: 'Dados do usuário atualizados com sucesso!',
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active !== false,
      permissions: user.permissions,
      permittedTankIds: user.permittedTankIds,
      updatedAt: user.updatedAt,
    },
  });
});

// POST /api/admin/users/:id/toggle-active
router.post('/users/:id/toggle-active', (req: AuthRequest, res) => {
  const { id } = req.params;
  const db = loadDb();
  const user = db.users.find((u) => u.id === id);

  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const willBeActive = user.active === false;

  // Prevent deactivating the last active administrator
  if (!willBeActive && user.role === 'admin') {
    const activeAdminCount = db.users.filter((u) => u.role === 'admin' && u.active !== false).length;
    if (activeAdminCount <= 1) {
      return res.status(400).json({ error: 'Não é possível desativar o único administrador ativo do sistema.' });
    }
  }

  user.active = willBeActive;
  user.updatedAt = new Date().toISOString();

  db.logs.push({
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString(),
    type: 'system',
    text: `Usuário "${user.username}" ${willBeActive ? 'ativado' : 'desativado'} pelo administrador ${req.user?.username}.`,
  });

  saveUsersDurable(db.users);

  res.json({
    success: true,
    message: `Usuário @${user.username} ${willBeActive ? 'ativado' : 'desativado'} com sucesso.`,
    active: user.active,
  });
});

// POST /api/admin/users/:id/reset-password - Quick password reset
router.post('/users/:id/reset-password', (req: AuthRequest, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
  }

  const db = loadDb();
  const user = db.users.find((u) => u.id === id);

  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const salt = bcrypt.genSaltSync(10);
  user.passwordHash = bcrypt.hashSync(String(newPassword).trim(), salt);
  user.updatedAt = new Date().toISOString();

  db.logs.push({
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString(),
    type: 'system',
    text: `Senha do usuário "${user.username}" redefinida pelo administrador ${req.user?.username}.`,
  });

  saveUsersDurable(db.users);

  res.json({ success: true, message: `Senha de @${user.username} redefinida com sucesso.` });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req: AuthRequest, res) => {
  const { id } = req.params;
  const currentAdmin = req.user!;

  if (currentAdmin.id === id) {
    return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário administrador conectado.' });
  }

  const db = loadDb();
  const userIndex = db.users.findIndex((u) => u.id === id);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const targetUser = db.users[userIndex];

  // Prevent removing the only administrator
  if (targetUser.role === 'admin') {
    const adminCount = db.users.filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Não é possível remover o único administrador do sistema.' });
    }
  }

  db.users.splice(userIndex, 1);

  db.logs.push({
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString(),
    type: 'system',
    text: `Usuário "${targetUser.username}" excluído pelo administrador ${currentAdmin.username}.`,
  });

  saveUsersDurable(db.users);

  res.json({ success: true, message: `Usuário "${targetUser.username}" removido com sucesso.` });
});

// GET /api/admin/backup - Complete backup of database
router.get('/backup', (req: AuthRequest, res) => {
  const db = loadDb();
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-');
  const filename = `hossidev-scada-backup-${dateStr}.json`;

  const backupPayload = {
    metadata: {
      appName: 'Hossidev Water Monitor SCADA',
      condominium: 'Condomínio Residencial Kizomba',
      version: '2.5.0-PROD',
      exportedAt: now.toISOString(),
      exportedBy: req.user?.username || 'admin',
      totalUsers: db.users.length,
      totalTanks: Object.keys(db.currentTanks).length,
      totalTelemetryRecords: db.telemetryHistory.length,
      totalLogs: db.logs.length,
    },
    systemConfig: db.systemConfig,
    users: db.users,
    currentTanks: db.currentTanks,
    nodes: db.nodes,
    telemetryHistory: db.telemetryHistory,
    logs: db.logs,
  };

  // Update last backup timestamp and write server snapshot
  db.systemConfig.lastBackupAt = now.toISOString();
  saveDb();
  performGeneralBackup(`Admin export by ${req.user?.username || 'admin'}`);

  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
  }

  res.json(backupPayload);
});

// POST /api/admin/restore - Restore complete database from backup JSON
router.post('/restore', (req: AuthRequest, res) => {
  const payload = req.body;

  if (!payload) {
    return res.status(400).json({ error: 'Nenhum dado de backup fornecido para restauração.' });
  }

  try {
    const result = restoreDb(payload);
    res.json({
      success: true,
      message: 'Backup completo restaurado com sucesso no servidor.',
      stats: result.stats,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Falha ao restaurar banco de dados.' });
  }
});

// GET /api/admin/stats - Storage and system stats
router.get('/stats', (_req, res) => {
  const stats = getDbStats();
  res.json({ success: true, stats });
});

// GET /api/admin/config - Get system configuration
router.get('/config', (_req, res) => {
  const db = loadDb();
  res.json({ success: true, config: db.systemConfig });
});

// Helper to convert capacity value + unit to liters
function calculateLitersFromUnit(val: number | null | undefined, unit: string | null | undefined): number | null {
  if (val === null || val === undefined || isNaN(val) || val <= 0) {
    return null;
  }
  const cleanVal = Number(val);
  if (unit === 'm3') {
    return Math.round(cleanVal * 1000);
  }
  if (unit === 'gal') {
    return Math.round(cleanVal * 3.78541);
  }
  return Math.round(cleanVal); // Default 'L'
}

// GET /api/admin/tanks - Get tank configurations, capacities, units, and assigned users
router.get('/tanks', (_req, res) => {
  const db = loadDb();
  const tanks = Object.values(db.currentTanks).map((t) => {
    // Find assigned users for this tank
    const assignedUsers = db.users
      .filter((u) => u.permittedTankIds && u.permittedTankIds.includes(t.id))
      .map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        email: u.email,
        role: u.role,
      }));

    return {
      id: t.id,
      name: t.name,
      grid: t.grid,
      sector: t.sector,
      sectorName: t.sectorName,
      nodeId: t.nodeId,
      capacity_value: t.capacity_value ?? (t.capacityLiters ?? (t.id <= 2 ? 20000 : t.id <= 4 ? 25000 : 30000)),
      capacity_unit: t.capacity_unit || 'L',
      capacityLiters: t.capacityLiters,
      waterClass: t.waterClass,
      defaultCapacityLiters: t.id <= 2 ? 20000 : t.id <= 4 ? 25000 : 30000,
      assignedUsers,
    };
  });

  res.json({ success: true, tanks });
});

// PUT /api/admin/tanks/:id - Update specific tank parameters and capacity
router.put('/tanks/:id(\\)d+)', (req: AuthRequest, res) => {
  const tankId = Number(req.params.id);
  const { name, capacity_value, capacity_unit, waterClass, nodeId, assignedUserIds } = req.body;

  const db = loadDb();
  const tank = db.currentTanks[tankId];

  if (!tank) {
    return res.status(404).json({ error: 'Reservatório não encontrado.' });
  }

  if (name && typeof name === 'string' && name.trim().length > 0) {
    tank.name = name.trim();
  }

  if (waterClass && typeof waterClass === 'string') {
    tank.waterClass = waterClass.trim();
  }

  if (nodeId && [1, 2, 3].includes(Number(nodeId))) {
    tank.nodeId = Number(nodeId);
  }

  // Handle optional capacity (null/empty => Modo Percentual)
  if (capacity_value === null || capacity_value === '' || capacity_value === undefined) {
    tank.capacity_value = null;
    tank.capacity_unit = capacity_unit || 'L';
    tank.capacityLiters = null;
  } else {
    const numVal = Number(capacity_value);
    if (!isNaN(numVal) && numVal > 0) {
      const unit = ['L', 'm3', 'gal'].includes(capacity_unit) ? capacity_unit : 'L';
      tank.capacity_value = numVal;
      tank.capacity_unit = unit as 'L' | 'm3' | 'gal';
      tank.capacityLiters = calculateLitersFromUnit(numVal, unit);
    } else {
      tank.capacity_value = null;
      tank.capacity_unit = 'L';
      tank.capacityLiters = null;
    }
  }

  // Sync assigned users if provided
  if (Array.isArray(assignedUserIds)) {
    for (const u of db.users) {
      if (assignedUserIds.includes(u.id)) {
        if (!u.permittedTankIds.includes(tankId)) {
          u.permittedTankIds.push(tankId);
          u.permittedTankIds.sort((a, b) => a - b);
        }
      } else {
        // Only remove if not admin or if user has other tanks
        u.permittedTankIds = u.permittedTankIds.filter((id) => id !== tankId);
      }
    }
  }

  db.logs.push({
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString(),
    type: 'system',
    text: `Reservatório ${tank.name} (T${tank.id}) atualizado pelo administrador ${req.user?.username}. Capacidade: ${
      tank.capacityLiters !== null ? `${tank.capacity_value} ${tank.capacity_unit} (${tank.capacityLiters} L)` : 'Modo Percentual (%)'
    }.`,
  });

  saveDb();

  res.json({
    success: true,
    message: `Configurações do ${tank.name} salvas com sucesso!`,
    tank,
  });
});

// PUT /api/admin/tanks/capacities - Update volumetric capacities for tanks
router.put('/tanks/capacities', (req: AuthRequest, res) => {
  const { capacities, tankConfigs } = req.body;

  const db = loadDb();
  const updatedTanks: Record<number, any> = {};

  // If detailed tankConfigs provided (including units and optional flags)
  if (tankConfigs && typeof tankConfigs === 'object') {
    for (const [idStr, cfg] of Object.entries(tankConfigs as Record<string, any>)) {
      const id = Number(idStr);
      if (db.currentTanks[id]) {
        const t = db.currentTanks[id];
        if (cfg.name && typeof cfg.name === 'string') t.name = cfg.name.trim();
        if (cfg.waterClass && typeof cfg.waterClass === 'string') t.waterClass = cfg.waterClass.trim();

        if (cfg.capacity_value === null || cfg.capacity_value === undefined || cfg.isPercentMode) {
          t.capacity_value = null;
          t.capacity_unit = cfg.capacity_unit || 'L';
          t.capacityLiters = null;
        } else {
          const val = Number(cfg.capacity_value);
          const unit = cfg.capacity_unit || 'L';
          if (!isNaN(val) && val > 0) {
            t.capacity_value = val;
            t.capacity_unit = unit;
            t.capacityLiters = calculateLitersFromUnit(val, unit);
          }
        }
        updatedTanks[id] = {
          name: t.name,
          capacity_value: t.capacity_value,
          capacity_unit: t.capacity_unit,
          capacityLiters: t.capacityLiters,
        };
      }
    }
  } else if (capacities && typeof capacities === 'object') {
    if (Array.isArray(capacities)) {
      for (const item of capacities) {
        const id = Number(item.id);
        const cap = Number(item.capacityLiters || item.capacity || item.capacity_value);
        const unit = item.capacity_unit || 'L';
        if (db.currentTanks[id]) {
          if (isNaN(cap) || cap <= 0 || item.capacity_value === null) {
            db.currentTanks[id].capacity_value = null;
            db.currentTanks[id].capacityLiters = null;
          } else {
            db.currentTanks[id].capacity_value = cap;
            db.currentTanks[id].capacity_unit = unit;
            db.currentTanks[id].capacityLiters = calculateLitersFromUnit(cap, unit);
          }
          updatedTanks[id] = db.currentTanks[id].capacityLiters;
        }
      }
    } else {
      for (const [idStr, capVal] of Object.entries(capacities)) {
        const id = Number(idStr);
        const cap = Number(capVal);
        if (db.currentTanks[id]) {
          if (isNaN(cap) || cap <= 0 || capVal === null) {
            db.currentTanks[id].capacity_value = null;
            db.currentTanks[id].capacityLiters = null;
          } else {
            db.currentTanks[id].capacity_value = cap;
            db.currentTanks[id].capacity_unit = 'L';
            db.currentTanks[id].capacityLiters = Math.round(cap);
          }
          updatedTanks[id] = db.currentTanks[id].capacityLiters;
        }
      }
    }
  }

  db.logs.push({
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString(),
    type: 'system',
    text: `Capacidades e parâmetros dos reservatórios atualizados pelo administrador ${req.user?.username}.`,
  });

  saveDb();

  res.json({
    success: true,
    message: 'Capacidades volumétricas e configurações dos reservatórios salvas com sucesso!',
    updatedTanks,
    tanks: db.currentTanks,
  });
});

// POST /api/admin/tanks/reset-capacities - Restore default engineering capacities
router.post('/tanks/reset-capacities', (req: AuthRequest, res) => {
  const db = loadDb();
  const defaults: Record<number, number> = {
    1: 20000,
    2: 20000,
    3: 25000,
    4: 25000,
    5: 30000,
    6: 30000,
  };

  for (const [idStr, cap] of Object.entries(defaults)) {
    const id = Number(idStr);
    if (db.currentTanks[id]) {
      db.currentTanks[id].capacity_value = cap;
      db.currentTanks[id].capacity_unit = 'L';
      db.currentTanks[id].capacityLiters = cap;
    }
  }

  db.logs.push({
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString(),
    type: 'system',
    text: `Capacidades dos reservatórios redefinidas para o padrão de engenharia (150.000 L) pelo administrador ${req.user?.username}.`,
  });

  saveDb();

  res.json({
    success: true,
    message: 'Capacidades redefinidas para o padrão de projeto de engenharia (150.000 L total).',
    tanks: db.currentTanks,
  });
});

// PUT /api/admin/config - Update system configuration
router.put('/config', (req: AuthRequest, res) => {
  const {
    audioAlarmEnabled,
    emergencyLockout,
    watchdogTimeoutMs,
    dailyConsumptionEstimateLiters,
    lowLevelAlertPercentage,
    criticalLevelAlertPercentage,
    condominiumName,
    tankCapacities,
  } = req.body;

  const db = loadDb();

  if (audioAlarmEnabled !== undefined) db.systemConfig.audioAlarmEnabled = Boolean(audioAlarmEnabled);
  if (emergencyLockout !== undefined) db.systemConfig.emergencyLockout = Boolean(emergencyLockout);
  if (watchdogTimeoutMs !== undefined) db.systemConfig.watchdogTimeoutMs = Math.max(2000, Number(watchdogTimeoutMs));
  if (dailyConsumptionEstimateLiters !== undefined) db.systemConfig.dailyConsumptionEstimateLiters = Math.max(1000, Number(dailyConsumptionEstimateLiters));
  if (lowLevelAlertPercentage !== undefined) db.systemConfig.lowLevelAlertPercentage = Math.min(50, Math.max(5, Number(lowLevelAlertPercentage)));
  if (criticalLevelAlertPercentage !== undefined) db.systemConfig.criticalLevelAlertPercentage = Math.min(30, Math.max(1, Number(criticalLevelAlertPercentage)));
  if (condominiumName !== undefined) db.systemConfig.condominiumName = String(condominiumName).trim();

  // If tankCapacities is provided in config update
  if (tankCapacities && typeof tankCapacities === 'object') {
    for (const [idStr, capVal] of Object.entries(tankCapacities)) {
      const id = Number(idStr);
      const cap = Number(capVal);
      if (db.currentTanks[id] && !isNaN(cap) && cap >= 1000 && cap <= 10000000) {
        db.currentTanks[id].capacityLiters = Math.round(cap);
      }
    }
  }

  db.logs.push({
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString(),
    type: 'system',
    text: `Definições do sistema atualizadas pelo administrador ${req.user?.username}.`,
  });

  saveDb();

  res.json({
    success: true,
    message: 'Definições do sistema salvas com sucesso!',
    config: db.systemConfig,
  });
});

export default router;

