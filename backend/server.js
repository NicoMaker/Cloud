// =============================================
//  MAIN SERVER FILE
// =============================================

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const fileUpload = require("express-fileupload");

// Importa tutti i moduli con i nuovi percorsi
const { setupDatabase } = require("./config/databaseSetup");
const { createSessionMiddleware, debugSessionMiddleware, requireLogin, requireAdmin } = require("./middleware/authMiddleware");
const { setupAuthRoutes } = require("./routes/authRoutes");
const { setupFileRoutes } = require("./routes/fileRoutes");
const { setupFileManipulationRoutes } = require("./routes/fileManipulationRoutes");
const { setupZipRoutes } = require("./routes/zipRoutes");
const { setupUserRoutes } = require("./routes/userRoutes");
const { setupWebSocket } = require("./sockets/websocketSetup");
const { getUserRoom, forceLogoutUserEverywhere } = require("./services/sessionUtils");
const { getLocalIP, getPublicIP } = require("./services/ipUtils");

// =============================================
//  SETUP EXPRESS & SOCKET.IO
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
//  ROUTE PER LA PAGINA PRINCIPALE
// =============================================

// Route per la root - reindirizza a login o dashboard
app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        // Se già loggato, mostra il dashboard
        res.sendFile(path.join(__dirname, "../frontend", "dashboard.html"));
    } else {
        // Altrimenti mostra la pagina di login
        res.sendFile(path.join(__dirname, "../frontend", "login.html"));
    }
});

// Route esplicita per la pagina di login
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "login.html"));
});

// Route per il dashboard (protetta)
app.get('/dashboard.html', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dashboard.html"));
});

// =============================================
//  SETUP ROUTES
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
//  START SERVER
// =============================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", async () => {
  const localIP = getLocalIP();
  const publicIP = await getPublicIP();
  const publicBaseUrl = publicIP
    ? `http://${publicIP}:${PORT}`
    : `http://localhost:${PORT}`;

  console.log("✅ Backend avviato");
  console.log(`🌐 IP Pubblico: ${publicIP ? publicBaseUrl : "non disponibile"}`);
  console.log(`🏠 IP Locale: http://${localIP}:${PORT}`);
  console.log(`📍 Localhost: http://localhost:${PORT}`);
  console.log("🔌 Socket.IO abilitato per sincronizzazione real-time");
  console.log("✏️  Rinomina file/cartelle: /api/rename");
  console.log("📋 Copia/Sposta file/cartelle: /api/copy-move");
  console.log("📦 Download zip cartella/file: /api/download-zip/*");
  console.log("📦 Download zip visualizzazione corrente: /api/download-current-view");
  console.log("👤 Admin credentials: Admin / Admin123!");
});