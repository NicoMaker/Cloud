// =============================================
//  SERVER CONFIGURATION FILE
// =============================================

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const fileUpload = require("express-fileupload");

// Importa tutti i moduli
const { setupDatabase } = require("./config/databaseSetup");
const {
  createSessionMiddleware,
  debugSessionMiddleware,
  requireLogin,
  requireAdmin,
} = require("./middleware/authMiddleware");
const { setupAuthRoutes } = require("./routes/authRoutes");
const { setupFileRoutes } = require("./routes/fileRoutes");
const {
  setupFileManipulationRoutes,
} = require("./routes/fileManipulationRoutes");
const { setupZipRoutes } = require("./routes/zipRoutes");
const { setupUserRoutes } = require("./routes/userRoutes");
const { setupWebSocket } = require("./sockets/websocketSetup");
const { forceLogoutUserEverywhere } = require("./services/sessionUtils");

// =============================================
//  CREATE APP
// =============================================

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// =============================================
//  DATABASE
// =============================================

const db = setupDatabase(__dirname);

// =============================================
//  MIDDLEWARE
// =============================================

app.use(express.static(path.join(__dirname, "../frontend")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  fileUpload({
    createParentPath: true,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
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

// =============================================
//  SETUP ROUTES API
// =============================================

setupAuthRoutes(app, db, requireLogin);
setupFileRoutes(app, db, requireLogin);

// forceLogoutUserEverywhere richiede io e app
const forceLogoutWithDeps = (userId, reason, callback) => {
  forceLogoutUserEverywhere(io, app, userId, reason, callback);
};

setupFileManipulationRoutes(app, db, io, requireLogin, requireAdmin);
setupZipRoutes(app, requireLogin);
setupUserRoutes(app, db, forceLogoutWithDeps, requireAdmin);

// =============================================
//  SETUP WEBSOCKET
// =============================================

setupWebSocket(io);

// =============================================
//  EXPORTS
// =============================================

module.exports = { app, server, io, db, requireLogin };
