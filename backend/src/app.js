// =============================================
//  COMPOSIZIONE APP EXPRESS + SOCKET.IO
// =============================================

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const fileUpload = require("express-fileupload");

const { setupDatabase } = require("./config/databaseSetup");
const {
  createSessionMiddleware,
  debugSessionMiddleware,
  requireLogin,
  requireAdmin,
} = require("./middleware/authMiddleware");
const { setupAuthRoutes } = require("./routes/authRoutes");
const { setupFileRoutes } = require("./routes/fileRoutes");
const { setupFileManipulationRoutes } = require("./routes/fileManipulationRoutes");
const { setupZipRoutes } = require("./routes/zipRoutes");
const { setupUserRoutes } = require("./routes/userRoutes");
const { setupWebSocket } = require("./sockets/websocketSetup");
const { forceLogoutUserEverywhere } = require("./services/sessionUtils");

function creaApp() {
  const app = express();
  const server = http.createServer(app);
  const io = socketIo(server);

  // Il database vive in backend/db → passo la root del backend (una sopra src)
  const backendRoot = path.join(__dirname, "..");
  const db = setupDatabase(backendRoot);

  const frontendDir = path.join(__dirname, "..", "..", "frontend");

  // Middleware
  app.use(express.static(frontendDir));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(
    fileUpload({
      createParentPath: true,
      limits: { fileSize: 500 * 1024 * 1024 },
      useTempFiles: true,
      tempFileDir: "/tmp/",
      preserveExtension: true,
      safeFileNames: false,
      parseNested: true,
    }),
  );

  const sessionMiddleware = createSessionMiddleware();
  app.use(sessionMiddleware);
  app.sessionStore = sessionMiddleware.store;
  app.use(debugSessionMiddleware());

  // Route API
  setupAuthRoutes(app, db, requireLogin);
  setupFileRoutes(app, db, requireLogin);

  const forceLogoutWithDeps = (userId, reason, callback) =>
    forceLogoutUserEverywhere(io, app, userId, reason, callback);

  setupFileManipulationRoutes(app, db, io, requireLogin, requireAdmin);
  setupZipRoutes(app, requireLogin);
  setupUserRoutes(app, db, forceLogoutWithDeps, requireAdmin);

  // WebSocket
  setupWebSocket(io);

  return { app, server, io, db, requireLogin, frontendDir };
}

module.exports = { creaApp };
