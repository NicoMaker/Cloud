// =============================================
//  ROUTE FILE MANIPULATION
// =============================================

const fs = require("fs");
const path = require("path");
const {
  copyRecursive,
  validatePathTraversal,
} = require("../services/fileSystemUtils");

function setupFileManipulationRoutes(app, db, io, requireLogin, requireAdmin) {
  const baseFolder = path.join(__dirname, "../../frontend/uploads");

  // POST rinomina
  app.post("/api/rename", requireLogin, (req, res) => {
    const { oldPath, newName } = req.body;

    if (!oldPath || !newName) {
      return res
        .status(400)
        .json({ success: false, message: "Parametri mancanti" });
    }

    if (
      newName.includes("/") ||
      newName.includes("\\") ||
      newName.includes("..")
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Nome non valido" });
    }

    const oldFullPath = path.normalize(path.join(baseFolder, oldPath));

    if (!validatePathTraversal(oldFullPath, baseFolder)) {
      return res
        .status(403)
        .json({ success: false, message: "Percorso non consentito" });
    }

    if (!fs.existsSync(oldFullPath)) {
      return res
        .status(404)
        .json({ success: false, message: "File o cartella non trovato" });
    }

    const parentDir = path.dirname(oldFullPath);
    const newFullPath = path.join(parentDir, newName);

    if (!validatePathTraversal(newFullPath, baseFolder)) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Percorso destinazione non consentito",
        });
    }

    if (fs.existsSync(newFullPath)) {
      return res
        .status(409)
        .json({
          success: false,
          message: "Esiste già un file o cartella con questo nome",
        });
    }

    try {
      fs.renameSync(oldFullPath, newFullPath);

      const oldRelPath = path
        .relative(baseFolder, oldFullPath)
        .replace(/\\/g, "/");
      const newRelPath = path
        .relative(baseFolder, newFullPath)
        .replace(/\\/g, "/");

      db.run(
        "UPDATE file_uploads SET filepath = ?, filename = ? WHERE filepath = ?",
        [newRelPath, newName, oldRelPath],
      );

      console.log(`✏️  Rinominato: "${oldRelPath}" → "${newRelPath}"`);
      io.emit("filesChanged", { action: "rename", timestamp: Date.now() });

      res.json({ success: true, newPath: newRelPath });
    } catch (error) {
      console.error("❌ Errore rinomina:", error);
      res
        .status(500)
        .json({
          success: false,
          message: "Errore durante la rinomina: " + error.message,
        });
    }
  });

  // POST copia/sposta
  app.post("/api/copy-move", requireLogin, (req, res) => {
    const { action, sourcePath, destFolder, newName } = req.body;

    if (!action || !sourcePath) {
      return res
        .status(400)
        .json({ success: false, message: "Parametri mancanti" });
    }

    if (!["copy", "move"].includes(action)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Azione non valida (usare 'copy' o 'move')",
        });
    }

    const safeName = (newName || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (safeName.includes("..")) {
      return res
        .status(400)
        .json({ success: false, message: "Nome destinazione non valido" });
    }

    const srcFullPath = path.normalize(path.join(baseFolder, sourcePath));
    if (!validatePathTraversal(srcFullPath, baseFolder)) {
      return res
        .status(403)
        .json({ success: false, message: "Percorso sorgente non consentito" });
    }

    if (!fs.existsSync(srcFullPath)) {
      return res
        .status(404)
        .json({
          success: false,
          message: "File o cartella sorgente non trovato",
        });
    }

    const originalName = path.basename(srcFullPath);
    const finalName = safeName || originalName;

    const destFolderClean = (destFolder || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    const destFullPath = path.normalize(
      path.join(
        baseFolder,
        destFolderClean ? destFolderClean + "/" + finalName : finalName,
      ),
    );

    if (!validatePathTraversal(destFullPath, baseFolder)) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Percorso destinazione non consentito",
        });
    }

    if (
      destFullPath === srcFullPath ||
      destFullPath.startsWith(srcFullPath + path.sep)
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Non puoi copiare/spostare una cartella dentro sé stessa",
        });
    }

    if (fs.existsSync(destFullPath)) {
      return res
        .status(409)
        .json({
          success: false,
          message: "Esiste già un elemento con questo nome nella destinazione",
        });
    }

    const destDir = path.dirname(destFullPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    try {
      if (action === "copy") {
        copyRecursive(srcFullPath, destFullPath);
        console.log(
          `📋 Copiato: "${sourcePath}" → "${path.relative(baseFolder, destFullPath)}"`,
        );
      } else {
        fs.renameSync(srcFullPath, destFullPath);

        const oldRelPath = path
          .relative(baseFolder, srcFullPath)
          .replace(/\\/g, "/");
        const newRelPath = path
          .relative(baseFolder, destFullPath)
          .replace(/\\/g, "/");
        db.run(
          "UPDATE file_uploads SET filepath = ?, filename = ? WHERE filepath = ?",
          [newRelPath, finalName, oldRelPath],
        );
        console.log(`🚚 Spostato: "${sourcePath}" → "${newRelPath}"`);
      }

      io.emit("filesChanged", { action, timestamp: Date.now() });
      res.json({
        success: true,
        destPath: path.relative(baseFolder, destFullPath).replace(/\\/g, "/"),
      });
    } catch (error) {
      console.error(`❌ Errore ${action}:`, error);
      res
        .status(500)
        .json({
          success: false,
          message: `Errore durante ${action === "copy" ? "la copia" : "lo spostamento"}: ${error.message}`,
        });
    }
  });

  // DELETE file/cartella
  app.delete("/api/delete/*", requireLogin, (req, res) => {
    if (req.session.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const filePath = path.normalize(path.join(baseFolder, req.params[0]));

    if (!validatePathTraversal(filePath, baseFolder)) {
      return res.status(403).json({ error: "Invalid path" });
    }

    if (fs.existsSync(filePath)) {
      try {
        const stats = fs.statSync(filePath);
        const relativePath = path
          .relative(baseFolder, filePath)
          .replace(/\\/g, "/");

        fs.rmSync(filePath, { recursive: true, force: true });

        if (stats.isFile()) {
          db.run("DELETE FROM file_uploads WHERE filepath = ?", [relativePath]);
        } else {
          db.run("DELETE FROM file_uploads WHERE filepath LIKE ?", [
            `${relativePath}/%`,
          ]);
        }

        console.log(`✅ Eliminato: ${filePath}`);
        io.emit("filesChanged", { action: "delete", timestamp: Date.now() });
        res.json({ success: true, message: "Eliminazione completata" });
      } catch (error) {
        console.error("❌ Errore eliminazione:", error);
        res
          .status(500)
          .json({ error: "Delete failed", message: error.message });
      }
    } else {
      res.status(404).json({ error: "File not found" });
    }
  });

  // DELETE tutti i file
  app.delete("/api/delete-all", requireAdmin, (req, res) => {
    try {
      if (fs.existsSync(baseFolder)) {
        fs.rmSync(baseFolder, { recursive: true, force: true });
        fs.mkdirSync(baseFolder, { recursive: true });
      }

      db.run("DELETE FROM file_uploads", (err) => {
        if (err) {
          console.error("❌ Errore pulizia database:", err);
          return res.status(500).json({ error: "Database cleanup failed" });
        }

        console.log("🗑️  Eliminati tutti i file e dati");
        io.emit("filesChanged", {
          action: "delete-all",
          timestamp: Date.now(),
        });
        res.json({
          success: true,
          message: "Tutti i file e dati sono stati eliminati",
        });
      });
    } catch (error) {
      console.error("❌ Errore eliminazione completa:", error);
      res
        .status(500)
        .json({ error: "Delete all failed", message: error.message });
    }
  });

  // POST crea cartella
  app.post("/api/create-folder", requireLogin, (req, res) => {
    const folderRelPath = req.body?.path;
    if (!folderRelPath || folderRelPath.includes("..")) {
      return res
        .status(400)
        .json({ success: false, message: "Percorso non valido" });
    }

    const fullPath = path.join(baseFolder, folderRelPath);

    try {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log("📁 Cartella creata:", fullPath);
      io.emit("filesChanged", {
        action: "create-folder",
        timestamp: Date.now(),
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Errore creazione cartella:", err);
      res.status(500).json({ success: false, message: "Errore interno" });
    }
  });
}

module.exports = {
  setupFileManipulationRoutes,
};
