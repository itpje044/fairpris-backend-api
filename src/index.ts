import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { logger } from './utils/logger';
import { globalErrorHandler, notFoundHandler } from './middleware/error.middleware';
import router from './api/routes';

const app = express();

const pdfDir = path.join(process.cwd(), 'public', 'pdfs');
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}

app.use(cors({
  origin: true, // Dynamically reflects requesting origin, allowing ALL origins with credentials!
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['*'],
  exposedHeaders: ['*'],
}));
app.use(express.static(path.join(process.cwd(), 'public'))); // serve frontend
app.use('/pdfs', express.static(pdfDir)); // static PDFs
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
}));
app.use(express.json({
  limit: '5mb',
  verify: (req, _res, buffer) => {
    (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  },
}));
app.use(express.urlencoded({ extended: true }));

// Simple request logger middleware
app.use((req, res, next) => {
  // Use path rather than url so query-string status tokens are never logged.
  logger.info(`[${req.method}] ${req.path}`);
  next();
});

app.use('/api', router);
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'fairpris-backend',
    timestamp: new Date().toISOString(),
    environment: config.server.nodeEnv,
  });
});

app.use(notFoundHandler);
app.use(globalErrorHandler);

// ─── Server Start & Graceful Shutdown ─────────────────────────────────────────

const server = app.listen(config.server.port, () => {
  logger.info(`Fairpris backend running`, {
    port: config.server.port,
    env: config.server.nodeEnv,
    baseUrl: config.server.baseUrl,
  });
});

const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force-exit after 10 s if connections don't close
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise rejection', { reason });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

export default app;
