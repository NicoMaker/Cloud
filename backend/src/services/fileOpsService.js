// =============================================
//  SERVICE OPERAZIONI FILE
//  Logica di business per rename / copy-move / delete / create-folder.
//  Nessuna dipendenza da req/res: riceve i dati, ritorna un risultato
//  o solleva un FileOpError con status e message.
// =============================================

const fs = require("fs");
const path = require("path");
const {
  copyRecursive,
  validatePathTraversal,
} = require("../utils/fileSystemUtils");

class FileOpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function creaFileOpsService(db, io, baseFolder) {
  const toRel = (p) => path.relative(baseFolder, p).replace(/\\/g, "/");
  const emit = (action) => io.emit("filesChanged", { action, timestamp: Date.now() });

  return {
    FileOpError,

    // Rinomina un file o cartella
    rename({ oldPath, newName }) {
      if (!oldPath || !newName) throw new FileOpError(400, "Parametri mancanti");
      if (newName.includes("/") || newName.includes("\\") || newName.includes("..")) {
        throw new FileOpError(400, "Nome non valido");
      }

      const oldFullPath = path.normalize(path.join(baseFolder, oldPath));
      if (!validatePathTraversal(oldFullPath, baseFolder)) {
        throw new FileOpError(403, "Percorso non consentito");
      }
      if (!fs.existsSync(oldFullPath)) {
        throw new FileOpError(404, "File o cartella non trovato");
      }

      const newFullPath = path.join(path.dirname(oldFullPath), newName);
      if (!validatePathTraversal(newFullPath, baseFolder)) {
        throw new FileOpError(403, "Percorso destinazione non consentito");
      }
      if (fs.existsSync(newFullPath)) {
        throw new FileOpError(409, "Esiste già un file o cartella con questo nome");
      }

      fs.renameSync(oldFullPath, newFullPath);
      const oldRelPath = toRel(oldFullPath);
      const newRelPath = toRel(newFullPath);
      db.run(
        "UPDATE file_uploads SET filepath = ?, filename = ? WHERE filepath = ?",
        [newRelPath, newName, oldRelPath],
      );
      console.log(`✏️  Rinominato: "${oldRelPath}" → "${newRelPath}"`);
      emit("rename");
      return { success: true, newPath: newRelPath };
    },

    // Copia o sposta un file/cartella
    copyMove({ action, sourcePath, destFolder, newName }) {
      if (!action || !sourcePath) throw new FileOpError(400, "Parametri mancanti");
      if (!["copy", "move"].includes(action)) {
        throw new FileOpError(400, "Azione non valida (usare 'copy' o 'move')");
      }

      const safeName = (newName || "").replace(/\\/g, "/").replace(/^\/+/, "");
      if (safeName.includes("..")) {
        throw new FileOpError(400, "Nome destinazione non valido");
      }

      const srcFullPath = path.normalize(path.join(baseFolder, sourcePath));
      if (!validatePathTraversal(srcFullPath, baseFolder)) {
        throw new FileOpError(403, "Percorso sorgente non consentito");
      }
      if (!fs.existsSync(srcFullPath)) {
        throw new FileOpError(404, "File o cartella sorgente non trovato");
      }

      const finalName = safeName || path.basename(srcFullPath);
      const destFolderClean = (destFolder || "").replace(/\\/g, "/").replace(/^\/+/, "");
      const destFullPath = path.normalize(
        path.join(
          baseFolder,
          destFolderClean ? destFolderClean + "/" + finalName : finalName,
        ),
      );

      if (!validatePathTraversal(destFullPath, baseFolder)) {
        throw new FileOpError(403, "Percorso destinazione non consentito");
      }
      if (destFullPath === srcFullPath || destFullPath.startsWith(srcFullPath + path.sep)) {
        throw new FileOpError(400, "Non puoi copiare/spostare una cartella dentro sé stessa");
      }
      if (fs.existsSync(destFullPath)) {
        throw new FileOpError(409, "Esiste già un elemento con questo nome nella destinazione");
      }

      const destDir = path.dirname(destFullPath);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      if (action === "copy") {
        copyRecursive(srcFullPath, destFullPath);
        console.log(`📋 Copiato: "${sourcePath}" → "${toRel(destFullPath)}"`);
      } else {
        fs.renameSync(srcFullPath, destFullPath);
        const oldRelPath = toRel(srcFullPath);
        const newRelPath = toRel(destFullPath);
        db.run(
          "UPDATE file_uploads SET filepath = ?, filename = ? WHERE filepath = ?",
          [newRelPath, finalName, oldRelPath],
        );
        console.log(`🚚 Spostato: "${sourcePath}" → "${newRelPath}"`);
      }

      emit(action);
      return { success: true, destPath: toRel(destFullPath) };
    },

    // Elimina un file o cartella (solo admin, controllato nel controller)
    deletePath(relPath) {
      const filePath = path.normalize(path.join(baseFolder, relPath));
      if (!validatePathTraversal(filePath, baseFolder)) {
        throw new FileOpError(403, "Invalid path", { error: "Invalid path" });
      }
      if (!fs.existsSync(filePath)) {
        throw new FileOpError(404, "File not found", { error: "File not found" });
      }

      const stats = fs.statSync(filePath);
      const relativePath = toRel(filePath);
      fs.rmSync(filePath, { recursive: true, force: true });

      if (stats.isFile()) {
        db.run("DELETE FROM file_uploads WHERE filepath = ?", [relativePath]);
      } else {
        db.run("DELETE FROM file_uploads WHERE filepath LIKE ?", [`${relativePath}/%`]);
      }
      console.log(`✅ Eliminato: ${filePath}`);
      emit("delete");
      return { success: true, message: "Eliminazione completata" };
    },

    // Elimina tutti i file e svuota la tabella
    deleteAll() {
      return new Promise((resolve, reject) => {
        try {
          if (fs.existsSync(baseFolder)) {
            fs.rmSync(baseFolder, { recursive: true, force: true });
            fs.mkdirSync(baseFolder, { recursive: true });
          }
          db.run("DELETE FROM file_uploads", (err) => {
            if (err) {
              console.error("❌ Errore pulizia database:", err);
              return reject(new FileOpError(500, "Database cleanup failed", { error: "Database cleanup failed" }));
            }
            console.log("🗑️  Eliminati tutti i file e dati");
            emit("delete-all");
            resolve({ success: true, message: "Tutti i file e dati sono stati eliminati" });
          });
        } catch (error) {
          reject(new FileOpError(500, error.message, { error: "Delete all failed" }));
        }
      });
    },

    // Crea una cartella
    createFolder(folderRelPath) {
      if (!folderRelPath || folderRelPath.includes("..")) {
        throw new FileOpError(400, "Percorso non valido");
      }
      const fullPath = path.join(baseFolder, folderRelPath);
      fs.mkdirSync(fullPath, { recursive: true });
      console.log("📁 Cartella creata:", fullPath);
      emit("create-folder");
      return { success: true };
    },
  };
}

module.exports = { creaFileOpsService, FileOpError };
