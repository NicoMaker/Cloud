// =============================================
//  ROUTE FILE OPERATIONS
// =============================================

const express = require("express");
const fs = require("fs");
const path = require("path");
const { validatePathTraversal, ensureUploadFolder } = require("../services/fileSystemUtils");

function setupFileRoutes(app, db, requireLogin) {
  const baseFolder = path.join(__dirname, "../../frontend/uploads");

  // GET lista file/cartelle
  app.get("/api/files", requireLogin, (req, res) => {
    const requestedFolder = path.join(baseFolder, req.query.folder || "");

    if (!fs.existsSync(requestedFolder)) {
      if (!fs.existsSync(baseFolder)) {
        ensureUploadFolder(baseFolder);
      }
      return res.json([]);
    }

    try {
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

      res.json(result);
    } catch (error) {
      console.error("Error reading directory:", error);
      res.status(500).json({ error: "Failed to read directory" });
    }
  });

  // GET download file
  app.get("/download/*", requireLogin, (req, res) => {
    const filePath = path.normalize(path.join(baseFolder, req.params[0]));
    if (!validatePathTraversal(filePath, baseFolder)) {
      return res.status(403).end();
    }

    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).send("File not found");
    }
  });

  // GET tree folder structure
  app.get("/api/tree", requireLogin, (req, res) => {
    const startFolder = req.query.folder
      ? path.join(baseFolder, req.query.folder)
      : baseFolder;

    function readTree(dir) {
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
    }

    if (!fs.existsSync(startFolder)) {
      return res.json({ folders: {}, files: [] });
    }
    const tree = readTree(startFolder);
    res.json(tree);
  });

  // POST upload file
  app.post("/upload", requireLogin, (req, res) => {
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

      ensureUploadFolder(baseFolder);

      const fileArray = Array.isArray(files) ? files : [files];
      const uploadResults = [];
      let relativePaths = [];
      const rawRelativePaths = req.body["relativePaths[]"] ?? req.body.relativePaths ?? null;

      if (Array.isArray(rawRelativePaths)) {
        relativePaths = rawRelativePaths.map((p) => String(p));
      } else if (typeof rawRelativePaths === "string") {
        try {
          const parsed = JSON.parse(rawRelativePaths);
          if (Array.isArray(parsed)) {
            relativePaths = parsed.map((p) => String(p));
          } else if (rawRelativePaths.trim() !== "") {
            relativePaths = [rawRelativePaths];
          }
        } catch (e) {
          if (rawRelativePaths.trim() !== "") {
            relativePaths = [rawRelativePaths];
          }
        }
      } else if (rawRelativePaths && typeof rawRelativePaths === "object") {
        relativePaths = Object.keys(rawRelativePaths)
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => String(rawRelativePaths[k]));
      }

      Promise.all(
        fileArray.map((file, index) => {
          return new Promise((resolve) => {
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
                savedAs: path.relative(baseFolder, targetFullPath).replace(/\\/g, "/"),
              });
              resolve();
            });
          });
        }),
      )
        .then(() => {
          if (req.body.folders) {
            let folders = [];
            try {
              folders = JSON.parse(req.body.folders);
            } catch (e) {}
            folders.forEach((folderRel) => {
              const folderPath = path.join(baseFolder, folderRel);
              if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
              }
            });
          }

          const successful = uploadResults.filter((r) => r.status === "success").length;
          const failed = uploadResults.filter((r) => r.status === "error").length;

          return res.json({
            success: failed === 0,
            totalFiles: successful,
            results: uploadResults,
            message: failed === 0 ? "Caricamento completato" : `Caricamento completato con ${failed} errori`,
          });
        })
        .catch((error) => {
          return res.status(500).json({
            success: false,
            totalFiles: 0,
            results: uploadResults,
            message: "Errore durante il caricamento dei file",
            error: error.message || error,
          });
        });
    } catch (error) {
      return res.status(500).json({
        success: false,
        totalFiles: 0,
        results: [],
        message: "Errore server critico",
        error: error.message || error,
      });
    }
  });
}

module.exports = {
  setupFileRoutes,
};