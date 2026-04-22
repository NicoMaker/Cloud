// =============================================
//  SERVER STARTUP FILE WITH HTML ROUTES
// =============================================

const path = require("path");
const { app, server, requireLogin } = require("./server");
const { getLocalIP, getPublicIP } = require("./services/ipUtils");

// =============================================
//  ROUTE PER LE PAGINE HTML
// =============================================

// Route per la root - reindirizza a login o dashboard
app.get("/", (req, res) => {
  if (req.session && req.session.userId) {
    // Se già loggato, mostra il dashboard
    res.sendFile(path.join(__dirname, "../frontend", "dashboard.html"));
  } else {
    // Altrimenti mostra la pagina di login
    res.sendFile(path.join(__dirname, "../frontend", "login.html"));
  }
});

// Route esplicita per la pagina di login
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "login.html"));
});

// Route per il dashboard (protetta)
app.get("/dashboard.html", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "dashboard.html"));
});

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
  console.log(
    `🌐 IP Pubblico: ${publicIP ? publicBaseUrl : "non disponibile"}`,
  );
  console.log(`🏠 IP Locale: http://${localIP}:${PORT}`);
  console.log(`📍 Localhost: http://localhost:${PORT}`);
  console.log("🔌 Socket.IO abilitato per sincronizzazione real-time");
  console.log("✏️  Rinomina file/cartelle: /api/rename");
  console.log("📋 Copia/Sposta file/cartelle: /api/copy-move");
  console.log("📦 Download zip cartella/file: /api/download-zip/*");
  console.log(
    "📦 Download zip visualizzazione corrente: /api/download-current-view",
  );
  console.log("👤 Admin credentials: Admin / Admin123!");
});
