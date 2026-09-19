const fs = require('fs');
const originalConsoleError = console.error;
console.error = function(...args) {
  fs.appendFileSync('backend-error.log', new Date().toISOString() + ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : a).join(' ') + '\n');
  originalConsoleError.apply(console, args);
};

require('dotenv').config();
require('./config/env').checkEnv();

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const helmet = require('helmet');
const corsConfig = require('./config/cors');
const connectDB = require('./config/database');

const { sanitize } = require('./middleware/sanitize');
const { performance } = require('./middleware/performance');
const { generalLimiter } = require('./middleware/advancedRateLimiter');
const { ddosAlert } = require('./middleware/ddosMonitor');
const { validateRequest } = require('./middleware/requestValidation');
const { limitSocketConnections } = require('./middleware/socketLimiter');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const healthRouter = require('./routes/health');
const openwaService = require('./services/openwaService');
const { startScheduler } = require('./services/campaign.service');
const { startRetryWorker } = require('./workers/retryWorker');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST'],
    credentials: true
  }
});

io.on('connection', (socket) => {
  if (!limitSocketConnections(socket)) {
    return;
  }
});

// Security & Middlewares
app.use(ddosAlert); // Earliest possible point for DDOS
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(corsConfig);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json({ limit: '10mb' })); // Reduced from 150mb
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(validateRequest); // Payload size and pattern checks
app.use(sanitize);
app.use(performance);

connectDB();

// Health Check
app.use('/health', healthRouter);

// Apply rate limiter to API routes
app.use('/api/', generalLimiter);

app.use('/api', authRoutes);
app.use('/admin', adminRoutes);
app.use('/api/campaigns', require('./routes/campaign.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/contacts', require('./routes/contact.routes'));
app.use('/api/whatsapp', require('./routes/whatsapp.routes'));
app.use('/api/warmers', require('./routes/warmer.routes'));

// Error handling middleware (must be last)
app.use(errorHandler);

openwaService.setupWhatsAppSocket(io);
startScheduler();
startRetryWorker();

// Auto-initialize sessions on startup
const initializeSessions = async () => {
  try {
    const WhatsAppSession = require('./models/WhatsAppSession');
    const sessions = await WhatsAppSession.find({ isConnected: true });
    for (const session of sessions) {
      await openwaService.startSession(session._id.toString());
    }
  } catch (error) {
    console.error('Failed to auto-initialize OpenWA sessions:', error);
  }
};
initializeSessions();

// On startup: mark any warmers left in RUNNING/PAUSED state (from a crashed/restarted server) back to STOPPED
// so users can see they need to restart them
const InternalWarmer = require('./models/InternalWarmer');
setTimeout(async () => {
  try {
    const staleWarmers = await InternalWarmer.find({ status: { $in: ['RUNNING', 'PAUSED'] } });
    if (staleWarmers.length > 0) {
      await InternalWarmer.updateMany(
        { status: { $in: ['RUNNING', 'PAUSED'] } },
        { status: 'STOPPED' }
      );
      console.log(`⚠️  Reset ${staleWarmers.length} stale warmer(s) to STOPPED on server restart`);
    }
  } catch (err) {
    console.error('Warmer cleanup error:', err);
  }
}, 3000); // Wait 3s for DB to connect

// Catch unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
});

// Catch uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  process.exit(1);
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Please kill the zombie process or change the port.`);
    process.exit(1);
  } else {
    console.error(`❌ Server error:`, err);
    process.exit(1);
  }
});

