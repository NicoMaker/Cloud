// =============================================
//  CONTROLLER + ROUTE FILE (list/tree/download/upload)
// =============================================

const path = require("path");
const {
  creaFileQueryService,
  parseRelativePaths,
} = require("../services/fileQueryService");

function setupFileRoutes(app, db, requireLogin) {
  const baseFolder = path.join(__dirname, "../../../frontend/uploads");
  const fileQuery = creaFileQueryService(baseFolder);

  // GET lista file/cartelle
  app.get("/api/files", requireLogin, (req, res) => {
    try {
      res.json(fileQuery.listaFile(req.query.folder || ""));
    } catch (error) {
      console.error("Error reading directory:", error);
      res.status(500).json({ error: "Failed to read directory" });
    }
  });

  // GET download file
  app.get("/download/*", requireLogin, (req, res) => {
    const esito = fileQuery.risolviDownload(req.params[0]);
    if (esito.forbidden) return res.status(403).end();
    if (esito.notFound) return res.status(404).send("File not found");
    res.download(esito.filePath);
  });

  // GET tree folder structure
  app.get("/api/tree", requireLogin, (req, res) => {
    res.json(fileQuery.albero(req.query.folder));
  });

  // POST upload file
  app.post("/upload", requireLogin, async (req, res) => {
    try {
      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ success: false, message: "Nessun file caricato" });
      }

      let files = req.files.files;
      if (!files) {
        const fileKeys = Object.keys(req.files);
        if (fileKeys.length > 0) files = req.files[fileKeys[0]];
      }
      if (!files) {
        return res.status(400).json({ success: false, message: "Nessun file trovato" });
      }

      const risultato = await fileQuery.salvaUpload({
        files,
        relativePaths: parseRelativePaths(req.body),
        folders: req.body.folders,
      });
      res.json(risultato);
    } catch (error) {
      res.status(500).json({
        success: false,
        totalFiles: 0,
        results: [],
        message: "Errore server critico",
        error: error.message || error,
      });
    }
  });
}

module.exports = { setupFileRoutes };
