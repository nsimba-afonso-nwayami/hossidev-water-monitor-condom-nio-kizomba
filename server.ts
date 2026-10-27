import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { loadDb, flushDb } from './server/db';
import { performGeneralBackup } from './server/backupService';
import authRoutes from './server/routes/auth';
import telemetryRoutes from './server/routes/telemetry';
import adminRoutes from './server/routes/admin';
import syncRoutes from './server/routes/sync';
import alertRoutes from './server/routes/alerts';
import pushRoutes from './server/routes/push';
import meRoutes from './server/routes/me';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize persistent database and perform general backup snapshot
  loadDb();
  performGeneralBackup('server_boot');

  // Middleware
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // API Routes
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'Hossidev Water Monitor SCADA Backend',
      time: new Date().toISOString(),
      version: '2.0.0-PROD',
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/telemetry', telemetryRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/alerts', alertRoutes);
  app.use('/api/push', pushRoutes);

  // Vite Middleware for Development / Static serving for Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Hossidev SCADA] Servidor rodando em http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Hossidev SCADA] Porta ${PORT} já em uso.`);
    } else {
      console.error('[Hossidev SCADA] Erro no servidor:', err);
    }
  });

  const handleShutdown = () => {
    console.log('[Hossidev SCADA] Encerrando servidor e descarregando banco...');
    flushDb();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

startServer().catch((err) => {
  console.error('[Hossidev SCADA] Erro fatal ao iniciar o servidor:', err);
});
