// =============================================
//  ROUTE ZIP DOWNLOAD
// =============================================

const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { validatePathTraversal } = require("./5-fileSystemUtils");

function setupZipRoutes(app, requireLogin) {
  const baseFolder = path.join(__dirname, "../frontend/uploads");

  // GET download zip singolo file/cartella
  app.get("/api/download-zip/*", requireLogin, (req, res) => {
    const itemPath = path.normalize(path.join(baseFolder, req.params[0]));

    if (!validatePathTraversal(itemPath, baseFolder)) {
      return res.status(403).json({ error: "Accesso non consentito" });
    }

    if (!fs.existsSync(itemPath)) {
      return res.status(404).json({ error: "File o cartella non trovato" });
    }

    const stats = fs.statSync(itemPath);
    const itemName = path.basename(itemPath);
    const zipName = itemName + ".zip";

    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);
    res.setHeader("Content-Type", "application/zip");

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      console.error("Errore archivio:", err);
      res.status(500).json({ error: "Errore nella creazione dello zip" });
    });

    archive.pipe(res);

    if (stats.isDirectory()) {
      archive.directory(itemPath, itemName);
    } else {
      archive.file(itemPath, { name: itemName });
    }

    archive.finalize();
    console.log(`📦 Creato zip: ${zipName}`);
  });

  // POST download zip visualizzazione corrente
  app.post("/api/download-current-view", requireLogin, (req, res) => {
    const folderPath = req.body.folder ? path.join(baseFolder, req.body.folder) : baseFolder;

    if (!validatePathTraversal(folderPath, baseFolder)) {
      return res.status(403).json({ error: "Accesso non consentito" });
    }

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: "Cartella non trovata" });
    }

    const folderName = path.basename(folderPath) || "files";
    const zipName = folderName + ".zip";

    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);
    res.setHeader("Content-Type", "application/zip");

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      console.error("Errore archivio:", err);
      res.status(500).json({ error: "Errore nella creazione dello zip" });
    });

    archive.pipe(res);

    try {
      const items = fs.readdirSync(folderPath, { withFileTypes: true });
      items.forEach((item) => {
        const itemFullPath = path.join(folderPath, item.name);
        if (item.isDirectory()) {
          archive.directory(itemFullPath, item.name);
        } else {
          archive.file(itemFullPath, { name: item.name });
        }
      });
    } catch (err) {
      console.error("Errore lettura cartella:", err);
      return res.status(500).json({ error: "Errore lettura cartella" });
    }

    archive.finalize();
    console.log(`📦 Creato zip visualizzazione: ${zipName}`);
  });
}

module.exports = {
  setupZipRoutes,
};
