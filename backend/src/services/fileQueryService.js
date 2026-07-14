// =============================================
//  SERVICE QUERY FILE
//  Lettura directory, albero, upload, risoluzione path per download.
// =============================================

const fs = require("fs");
const path = require("path");
const {
  validatePathTraversal,
  ensureUploadFolder,
} = require("../utils/fileSystemUtils");

function creaFileQueryService(baseFolder) {
  return {
    // Lista file/cartelle di una cartella (ordinati: cartelle prima)
    listaFile(folder = "") {
      const requestedFolder = path.join(baseFolder, folder);
      if (!fs.existsSync(requestedFolder)) {
        ensureUploadFolder(baseFolder);
        return [];
      }

      const items = fs.readdirSync(requestedFolder, { withFileTypes: true });
      const result = items.map((item) => {
        const fullPath = path.join(requestedFolder, item.name);
        const relPath = path.relative(baseFolder, fullPath).replace(/\\/g, "/");
        const stats = fs.statSync(fullPath);
        return {
          name: item.name,
          path: relPath,
          type: item.isDirectory() ? "folder" : "file",
          size: item.isDirectory() ? null : stats.size,
          modified: stats.mtime,
          created: stats.birthtime,
        };
      });

      result.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return result;
    },

    // Struttura ad albero a partire da una cartella
    albero(folder) {
      const startFolder = folder ? path.join(baseFolder, folder) : baseFolder;
      if (!fs.existsSync(startFolder)) return { folders: {}, files: [] };

      const readTree = (dir) => {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        const result = { folders: {}, files: [] };
        items.forEach((item) => {
          if (item.isDirectory()) {
            result.folders[item.name] = readTree(path.join(dir, item.name));
          } else {
            result.files.push(item.name);
          }
        });
        return result;
      };
      return readTree(startFolder);
    },

    // Risolve e valida il percorso per il download; ritorna null se non valido
    risolviDownload(relPath) {
      const filePath = path.normalize(path.join(baseFolder, relPath));
      if (!validatePathTraversal(filePath, baseFolder)) return { forbidden: true };
      if (!fs.existsSync(filePath)) return { notFound: true };
      return { filePath };
    },

    // Salva i file caricati rispettando i relativePaths; ritorna il riepilogo
    async salvaUpload({ files, relativePaths, folders }) {
      ensureUploadFolder(baseFolder);

      const fileArray = Array.isArray(files) ? files : [files];
      const uploadResults = [];

      await Promise.all(
        fileArray.map(
          (file, index) =>
            new Promise((resolve) => {
              const incomingRelativePath = relativePaths[index] || file.name;
              let targetRelativePath = String(incomingRelativePath)
                .replace(/\\/g, "/")
                .replace(/^\/+/, "");
              targetRelativePath = path.posix.normalize(targetRelativePath);

              if (
                targetRelativePath === "." ||
                targetRelativePath === "" ||
                targetRelativePath.startsWith("../") ||
                targetRelativePath.includes("/../")
              ) {
                uploadResults.push({
                  filename: file.name,
                  status: "error",
                  error: "Percorso file non valido",
                });
                return resolve();
              }

              const targetFullPath = path.join(baseFolder, targetRelativePath);
              const targetDirectory = path.dirname(targetFullPath);
              if (!fs.existsSync(targetDirectory)) {
                fs.mkdirSync(targetDirectory, { recursive: true });
              }

              file.mv(targetFullPath, (moveError) => {
                uploadResults.push({
                  filename: file.name,
                  status: moveError ? "error" : "success",
                  error: moveError ? moveError.message : undefined,
                  savedAs: path
                    .relative(baseFolder, targetFullPath)
                    .replace(/\\/g, "/"),
                });
                resolve();
              });
            }),
        ),
      );

      // Crea eventuali cartelle vuote passate dal client
      if (folders) {
        let parsed = [];
        try {
          parsed = JSON.parse(folders);
        } catch (e) {}
        parsed.forEach((folderRel) => {
          const folderPath = path.join(baseFolder, folderRel);
          if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
          }
        });
      }

      const successful = uploadResults.filter((r) => r.status === "success").length;
      const failed = uploadResults.filter((r) => r.status === "error").length;

      return {
        success: failed === 0,
        totalFiles: successful,
        results: uploadResults,
        message:
          failed === 0
            ? "Caricamento completato"
            : `Caricamento completato con ${failed} errori`,
      };
    },
  };
}

// Normalizza il campo relativePaths dalle varie forme del body
function parseRelativePaths(body) {
  const raw = body["relativePaths[]"] ?? body.relativePaths ?? null;
  if (Array.isArray(raw)) return raw.map((p) => String(p));
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((p) => String(p));
    } catch (e) {}
    return raw.trim() !== "" ? [raw] : [];
  }
  if (raw && typeof raw === "object") {
    return Object.keys(raw)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => String(raw[k]));
  }
  return [];
}

module.exports = { creaFileQueryService, parseRelativePaths };
