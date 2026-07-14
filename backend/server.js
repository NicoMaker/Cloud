// =============================================
//  ENTRY POINT
// =============================================

const { creaApp } = require("./src/app");
const { setupHtmlRoutes } = require("./src/routes/htmlRoutes");
const { getLocalIP, getPublicIP } = require("./src/utils/ipUtils");

const { app, server, requireLogin, frontendDir } = creaApp();

setupHtmlRoutes(app, requireLogin, frontendDir);

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", async () => {
  const localIP = getLocalIP();
  const publicIP = await getPublicIP();
  const publicBaseUrl = publicIP ? `http://${publicIP}:${PORT}` : `http://localhost:${PORT}`;
  console.log("✅ Backend avviato");
  console.log(`🌐 IP Pubblico: ${publicIP ? publicBaseUrl : "non disponibile"}`);
  console.log(`🏠 IP Locale: http://${localIP}:${PORT}`);
  console.log(`📍 Localhost: http://localhost:${PORT}`);
  console.log("🔌 Socket.IO abilitato per sincronizzazione real-time");
  console.log("👤 Admin credentials: Admin / Admin123!");
});
