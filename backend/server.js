const express = require("express");
const session = require("express-session");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const fileUpload = require("express-fileupload");
const fs = require("fs");
const http = require("http");
const socketIo = require("socket.io");
const crypto = require("crypto");
const os = require("os");
const https = require("https");

const archiver = require("archiver");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const USER_ROOM_PREFIX = "user:";

// Funzioni di sicurezza password
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, hashedPassword) {
  const [salt, hash] = hashedPassword.split(":");
  const verifyHash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return hash === verifyHash;
}

function validatePassword(password) {
  const errors = [];

  if (password.length < 8) {
    errors.push("La password deve essere di almeno 8 caratteri");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("La password deve contenere almeno una lettera maiuscola");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("La password deve contenere almeno una lettera minuscola");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("La password deve contenere almeno un numero");
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("La password deve contenere almeno un carattere speciale");
  }

  return errors;
}

// Database setup
const dbDir = path.join(__dirname, "db");
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const dbFile = path.join(dbDir, "database.db");
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS file_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  // Crea admin solo se non esistono admin
  db.get(
    "SELECT COUNT(*) as count FROM users WHERE role = 'admin'",
    (err, row) => {
      if (!err && row.count === 0) {
        const hashedPassword = hashPassword("Admin123!");
        db.run(
          "INSERT INTO users (username, password, role) VALUES ('Admin', ?, 'admin')",
          [hashedPassword],
        );
        console.log(
          "👤 Admin iniziale creato con password: Admin123! e username Admin",
        );
        console.log(
          "🔧 Puoi creare altri admin e poi eliminare quello iniziale se necessario",
        );
      } else if (!err && row.count > 0) {
        console.log(`👥 Trovati ${row.count} amministratori esistenti`);
        console.log(
          "🛡️ Sistema multi-admin attivo: puoi gestire admin liberamente mantenendone almeno uno",
        );
      }
    },
  );
});

// Funzioni helper per gestione admin
function countAdmins(callback) {
  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", callback);
}

function canDeleteAdmin(adminId, callback) {
  countAdmins((err, row) => {
    if (err) return callback(err, false);
    callback(null, row.count > 1);
  });
}

function canChangeAdminToUser(adminId, callback) {
  countAdmins((err, row) => {
    if (err) return callback(err, false);
    callback(null, row.count > 1);
  });
}

function getUserRoom(userId) {
  return `${USER_ROOM_PREFIX}${userId}`;
}

function destroyUserSessionsByUserId(userId, callback) {
  if (!app.sessionStore || typeof app.sessionStore.all !== "function") {
    return callback();
  }

  app.sessionStore.all((allErr, sessions) => {
    if (allErr || !sessions) {
      console.error("Errore lettura sessioni:", allErr);
      return callback();
    }

    const matchingSessionIds = Object.entries(sessions)
      .filter(([, sess]) => Number(sess?.user?.id) === Number(userId))
      .map(([sid]) => sid);

    if (matchingSessionIds.length === 0) {
      return callback();
    }

    let pending = matchingSessionIds.length;
    matchingSessionIds.forEach((sid) => {
      app.sessionStore.destroy(sid, (destroyErr) => {
        if (destroyErr) {
          console.error("Errore destroy session:", destroyErr);
        }
        pending -= 1;
        if (pending === 0) callback();
      });
    });
  });
}

function forceLogoutUserEverywhere(userId, reason = "account_changed", callback) {
  io.to(getUserRoom(userId)).emit("forceLogout", { reason });
  io.in(getUserRoom(userId)).disconnectSockets(true);
  destroyUserSessionsByUserId(userId, callback || (() => {}));
}

// Middleware
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
const sessionMiddleware = session({
    secret: crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax",
    },
    name: "filemanager.sid",
  });
app.use(sessionMiddleware);
app.sessionStore = sessionMiddleware.store;

// Debug middleware per sessioni
app.use((req, res, next) => {
  if (req.path === "/upload" || req.path.startsWith("/api/")) {
    console.log(`🔍 ${req.method} ${req.path} - Session:`, {
      hasSession: !!req.session,
      hasUser: !!req.session?.user,
      userId: req.session?.user?.id,
      userRole: req.session?.user?.role,
    });
  }
  next();
});

// Auth middleware
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    if (
      req.xhr ||
      req.headers.accept?.indexOf("json") > -1 ||
      req.path.startsWith("/api/") ||
      req.path === "/upload"
    ) {
      return res.status(401).json({
        error: "Autenticazione richiesta",
        message: "Sessione scaduta. Effettua nuovamente il login.",
        redirect: "/login.html",
      });
    }
    return res.redirect("/login.html?error=session_expired");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    if (req.xhr || req.headers.accept.indexOf("json") > -1) {
      return res.status(403).json({ error: "Admin access required" });
    }
    return res.redirect("/dashboard.html");
  }
  next();
}

// Routes
app.get("/", (req, res) => res.redirect("/login.html"));

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect("/login.html?error=missing_fields");
  }

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
      console.error("Database error:", err);
      return res.redirect("/login.html?error=database_error");
    }

    if (user && verifyPassword(password, user.password)) {
      db.run("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", [
        user.id,
      ]);

      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
      };
      res.redirect("/dashboard.html");
    } else {
      res.redirect("/login.html?error=invalid_credentials");
    }
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destroy error:", err);
    }
    res.redirect("/login.html");
  });
});

// API Files
app.get("/api/files", requireLogin, (req, res) => {
  const baseFolder = path.join(__dirname, "../frontend/uploads");
  const requestedFolder = path.join(baseFolder, req.query.folder || "");

  if (!fs.existsSync(requestedFolder)) {
    if (!fs.existsSync(baseFolder)) {
      fs.mkdirSync(baseFolder, { recursive: true });
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

// =============================================
//  ENDPOINT RINOMINA - NUOVO
// =============================================
app.post("/api/rename", requireLogin, (req, res) => {
  const { oldPath, newName } = req.body;

  // Validazione input
  if (!oldPath || !newName) {
    return res.status(400).json({ success: false, message: "Parametri mancanti" });
  }

  // Sicurezza: nessun path traversal nel nuovo nome
  if (newName.includes("/") || newName.includes("\\") || newName.includes("..")) {
    return res.status(400).json({ success: false, message: "Nome non valido" });
  }

  const baseFolder = path.join(__dirname, "../frontend/uploads");

  // Percorso sorgente
  const oldFullPath = path.normalize(path.join(baseFolder, oldPath));

  // Verifica che il percorso sia dentro la cartella uploads
  if (!oldFullPath.startsWith(baseFolder)) {
    return res.status(403).json({ success: false, message: "Percorso non consentito" });
  }

  if (!fs.existsSync(oldFullPath)) {
    return res.status(404).json({ success: false, message: "File o cartella non trovato" });
  }

  // Percorso destinazione: stessa cartella padre, solo cambio nome
  const parentDir = path.dirname(oldFullPath);
  const newFullPath = path.join(parentDir, newName);

  // Verifica che anche la destinazione sia dentro uploads
  if (!newFullPath.startsWith(baseFolder)) {
    return res.status(403).json({ success: false, message: "Percorso destinazione non consentito" });
  }

  // Verifica che non esista già qualcosa con quel nome
  if (fs.existsSync(newFullPath)) {
    return res.status(409).json({ success: false, message: "Esiste già un file o cartella con questo nome" });
  }

  try {
    fs.renameSync(oldFullPath, newFullPath);

    // Aggiorna i record nel database se è un file
    const oldRelPath = path.relative(baseFolder, oldFullPath).replace(/\\/g, "/");
    const newRelPath = path.relative(baseFolder, newFullPath).replace(/\\/g, "/");

    db.run(
      "UPDATE file_uploads SET filepath = ?, filename = ? WHERE filepath = ?",
      [newRelPath, newName, oldRelPath],
    );

    console.log(`✏️  Rinominato: "${oldRelPath}" → "${newRelPath}"`);
    io.emit("filesChanged", { action: "rename", timestamp: Date.now() });

    res.json({ success: true, newPath: newRelPath });
  } catch (error) {
    console.error("❌ Errore rinomina:", error);
    res.status(500).json({ success: false, message: "Errore durante la rinomina: " + error.message });
  }
});

// Upload
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
    const baseFolder = path.join(__dirname, "../frontend/uploads");
    if (!fs.existsSync(baseFolder)) fs.mkdirSync(baseFolder, { recursive: true });
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
          if (!fs.existsSync(targetDirectory)) fs.mkdirSync(targetDirectory, { recursive: true });
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
          try { folders = JSON.parse(req.body.folders); } catch (e) {}
          folders.forEach((folderRel) => {
            const folderPath = path.join(baseFolder, folderRel);
            if (!fs.existsSync(folderPath)) {
              fs.mkdirSync(folderPath, { recursive: true });
            }
          });
        }
        const successful = uploadResults.filter((r) => r.status === "success").length;
        const failed = uploadResults.filter((r) => r.status === "error").length;
        if (successful > 0) {
          io.emit("filesChanged", { action: "upload", timestamp: Date.now() });
        }
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

app.get("/download/*", requireLogin, (req, res) => {
  const baseFolder = path.join(__dirname, "../frontend/uploads");
  const filePath = path.normalize(path.join(baseFolder, req.params[0]));
  if (!filePath.startsWith(baseFolder)) return res.status(403).end();

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send("File not found");
  }
});

app.delete("/api/delete/*", requireLogin, (req, res) => {
  if (req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const baseFolder = path.join(__dirname, "../frontend/uploads");
  const filePath = path.normalize(path.join(baseFolder, req.params[0]));

  if (!filePath.startsWith(baseFolder)) {
    return res.status(403).json({ error: "Invalid path" });
  }

  if (fs.existsSync(filePath)) {
    try {
      const stats = fs.statSync(filePath);
      const relativePath = path.relative(baseFolder, filePath).replace(/\\/g, "/");

      fs.rmSync(filePath, { recursive: true, force: true });

      if (stats.isFile()) {
        db.run("DELETE FROM file_uploads WHERE filepath = ?", [relativePath]);
      } else {
        db.run("DELETE FROM file_uploads WHERE filepath LIKE ?", [`${relativePath}/%`]);
      }

      console.log(`✅ Eliminato: ${filePath}`);
      io.emit("filesChanged", { action: "delete", timestamp: Date.now() });
      res.json({ success: true, message: "Eliminazione completata" });
    } catch (error) {
      console.error("❌ Errore eliminazione:", error);
      res.status(500).json({ error: "Delete failed", message: error.message });
    }
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

app.delete("/api/delete-all", requireAdmin, (req, res) => {
  const baseFolder = path.join(__dirname, "../frontend/uploads");

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
      io.emit("filesChanged", { action: "delete-all", timestamp: Date.now() });
      res.json({ success: true, message: "Tutti i file e dati sono stati eliminati" });
    });
  } catch (error) {
    console.error("❌ Errore eliminazione completa:", error);
    res.status(500).json({ error: "Delete all failed", message: error.message });
  }
});

// User management
app.get("/api/users", requireAdmin, (req, res) => {
  db.all(
    "SELECT id, username, role, created_at, last_login FROM users ORDER BY role DESC, username",
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: "Database error" });
      } else {
        countAdmins((countErr, adminCount) => {
          if (countErr) {
            return res.status(500).json({ error: "Error counting admins" });
          }

          const usersWithPermissions = rows.map((user) => ({
            ...user,
            canDelete: user.role !== "admin" || adminCount.count > 1,
            canChangeRole: user.role !== "admin" || adminCount.count > 1,
            isProtected: user.role === "admin" && adminCount.count === 1,
          }));

          res.json({
            users: usersWithPermissions,
            adminCount: adminCount.count,
            totalUsers: rows.length,
          });
        });
      }
    },
  );
});

app.post("/create-user", requireAdmin, (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.redirect("/admin.html?error=missing_fields");
  }

  const passwordErrors = validatePassword(password);
  if (passwordErrors.length > 0) {
    return res.redirect(
      `/admin.html?error=weak_password&details=${encodeURIComponent(passwordErrors.join(", "))}`,
    );
  }

  const hashedPassword = hashPassword(password);

  db.run(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
    [username, hashedPassword, role],
    (err) => {
      if (err) {
        if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
          res.redirect("/admin.html?error=user_exists");
        } else {
          console.error("Database error:", err);
          res.redirect("/admin.html?error=database_error");
        }
      } else {
        console.log(`✅ Utente creato: ${username} (${role})`);
        res.redirect("/admin.html?success=user_created");
      }
    },
  );
});

app.post("/update-user", requireAdmin, (req, res) => {
  const { id, username, password, role } = req.body;

  if (!id || !username || !role) {
    return res.redirect("/admin.html?error=missing_fields");
  }

  if (password) {
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.redirect(
        `/admin.html?error=weak_password&details=${encodeURIComponent(passwordErrors.join(", "))}`,
      );
    }
  }

  db.get("SELECT role FROM users WHERE id = ?", [id], (err, user) => {
    if (err) {
      console.error("Database error:", err);
      return res.redirect("/admin.html?error=database_error");
    }

    if (!user) {
      return res.redirect("/admin.html?error=user_not_found");
    }

    if (user.role === "admin" && role === "user") {
      canChangeAdminToUser(id, (canChangeErr, canChange) => {
        if (canChangeErr) {
          console.error("Error checking admin change permission:", canChangeErr);
          return res.redirect("/admin.html?error=database_error");
        }

        if (!canChange) {
          return res.redirect(
            "/admin.html?error=cannot_change_last_admin&details=Non puoi cambiare l'ultimo amministratore in utente",
          );
        }

        updateUserInDatabase();
      });
    } else {
      updateUserInDatabase();
    }

    function updateUserInDatabase() {
      let query, params;
      if (password) {
        const hashedPassword = hashPassword(password);
        query = "UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?";
        params = [username, hashedPassword, role, id];
      } else {
        query = "UPDATE users SET username = ?, role = ? WHERE id = ?";
        params = [username, role, id];
      }

      db.run(query, params, (updateErr) => {
        if (updateErr) {
          console.error("Database error:", updateErr);
          res.redirect("/admin.html?error=update_failed");
        } else {
          console.log(`✅ Utente aggiornato: ${username} (${role})`);
          forceLogoutUserEverywhere(id, "account_updated", () => {
            res.redirect("/admin.html?success=user_updated");
          });
        }
      });
    }
  });
});

app.post("/delete-user", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.body.id);

  if (!id) {
    return res.redirect("/admin.html?error=invalid_user_id");
  }

  db.get("SELECT role FROM users WHERE id = ?", [id], (err, user) => {
    if (err) {
      console.error("Database error:", err);
      return res.redirect("/admin.html?error=database_error");
    }

    if (!user) {
      return res.redirect("/admin.html?error=user_not_found");
    }

    if (user.role === "admin") {
      canDeleteAdmin(id, (canDeleteErr, canDelete) => {
        if (canDeleteErr) {
          console.error("Error checking admin delete permission:", canDeleteErr);
          return res.redirect("/admin.html?error=database_error");
        }

        if (!canDelete) {
          return res.redirect(
            "/admin.html?error=cannot_delete_last_admin&details=Non puoi eliminare l'ultimo amministratore",
          );
        }

        deleteUserFromDatabase();
      });
    } else {
      deleteUserFromDatabase();
    }

    function deleteUserFromDatabase() {
      db.run("DELETE FROM users WHERE id = ?", [id], (deleteErr) => {
        if (deleteErr) {
          console.error("Database error:", deleteErr);
          res.redirect("/admin.html?error=delete_failed");
        } else {
          console.log(`✅ Utente eliminato: ID ${id}`);
          forceLogoutUserEverywhere(id, "account_deleted", () => {
            res.redirect("/admin.html?success=user_deleted");
          });
        }
      });
    }
  });
});

app.get("/session-info", (req, res) => {
  const id = req.session?.user?.id || null;
  const role = req.session?.user?.role || "guest";
  const username = req.session?.user?.username || "guest";
  res.json({ id, role, username });
});

app.get("/api/session-check", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ valid: false, message: "Sessione non valida" });
  }

  res.json({
    valid: true,
    user: {
      id: req.session.user.id,
      username: req.session.user.username,
      role: req.session.user.role,
    },
  });
});

// WebSocket
io.on("connection", (socket) => {
  console.log("Client connected for real-time updates");

  socket.on("registerUserSession", (payload) => {
    const userId = Number(payload?.userId);
    if (!Number.isNaN(userId) && userId > 0) {
      socket.join(getUserRoom(userId));
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

app.post("/api/create-folder", requireLogin, (req, res) => {
  const folderRelPath = req.body?.path;
  if (!folderRelPath || folderRelPath.includes("..")) {
    return res.status(400).json({ success: false, message: "Percorso non valido" });
  }

  const baseFolder = path.join(__dirname, "../frontend/uploads");
  const fullPath = path.join(baseFolder, folderRelPath);

  try {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log("📁 Cartella creata:", fullPath);
    io.emit("filesChanged", { action: "create-folder", timestamp: Date.now() });
    res.json({ success: true });
  } catch (err) {
    console.error("Errore creazione cartella:", err);
    res.status(500).json({ success: false, message: "Errore interno" });
  }
});

app.get("/download-folder", requireLogin, (req, res) => {
  const folderPath = path.join(
    __dirname,
    "../frontend/uploads",
    req.query.folder || "",
  );
  const zipName = path.basename(folderPath) + ".zip";

  res.setHeader("Content-Disposition", `attachment; filename=${zipName}`);
  res.setHeader("Content-Type", "application/zip");

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(folderPath, false);
  archive.finalize();
});

app.get("/api/tree", requireLogin, (req, res) => {
  const baseFolder = path.join(__dirname, "../frontend/uploads");
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

const PORT = process.env.PORT || 3000;

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }
  return "127.0.0.1";
}

async function getPublicIP() {
  try {
    return await new Promise((resolve, reject) => {
      https
        .get("https://api.ipify.org?format=json", (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const ip = JSON.parse(data).ip;
              resolve(ip || null);
            } catch (error) {
              reject(error);
            }
          });
        })
        .on("error", reject);
    });
  } catch (error) {
    console.error("⚠️ Impossibile recuperare IP pubblico:", error.message);
    return null;
  }
}

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
  console.log("👤 Admin credentials: Admin / Admin123!");
});