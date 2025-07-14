const express = require("express")
const session = require("express-session")
const path = require("path")
const sqlite3 = require("sqlite3").verbose()
const fileUpload = require("express-fileupload")
const fs = require("fs")
const http = require("http")
const socketIo = require("socket.io")
const crypto = require("crypto")

const archiver = require("archiver")

const app = express()
const server = http.createServer(app)
const io = socketIo(server)

// Funzioni di sicurezza password
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex")
  return `${salt}:${hash}`
}

function verifyPassword(password, hashedPassword) {
  const [salt, hash] = hashedPassword.split(":")
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex")
  return hash === verifyHash
}

function validatePassword(password) {
  const errors = []

  if (password.length < 8) {
    errors.push("La password deve essere di almeno 8 caratteri")
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("La password deve contenere almeno una lettera maiuscola")
  }

  if (!/[a-z]/.test(password)) {
    errors.push("La password deve contenere almeno una lettera minuscola")
  }

  if (!/[0-9]/.test(password)) {
    errors.push("La password deve contenere almeno un numero")
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("La password deve contenere almeno un carattere speciale")
  }

  return errors
}

// Database setup
const dbDir = path.join(__dirname, "db")
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir)

const dbFile = path.join(dbDir, "database.db")
const db = new sqlite3.Database(dbFile)

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
  `)

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
  `)

  // Crea admin solo se non esistono admin
  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", (err, row) => {
    if (!err && row.count === 0) {
      const hashedPassword = hashPassword("Admin123!")
      db.run("INSERT INTO users (username, password, role) VALUES ('Admin', ?, 'admin')", [hashedPassword])
      console.log("👤 Admin iniziale creato con password: Admin123! e username Admin")
      console.log("🔧 Puoi creare altri admin e poi eliminare quello iniziale se necessario")
    } else if (!err && row.count > 0) {
      console.log(`👥 Trovati ${row.count} amministratori esistenti`)
      console.log("🛡️ Sistema multi-admin attivo: puoi gestire admin liberamente mantenendone almeno uno")
    }
  })
})

// Funzioni helper per gestione admin
function countAdmins(callback) {
  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", callback)
}

function canDeleteAdmin(adminId, callback) {
  countAdmins((err, row) => {
    if (err) return callback(err, false)
    // Può eliminare solo se ci sono più di 1 admin
    callback(null, row.count > 1)
  })
}

function canChangeAdminToUser(adminId, callback) {
  countAdmins((err, row) => {
    if (err) return callback(err, false)
    // Può cambiare ruolo solo se ci sono più di 1 admin
    callback(null, row.count > 1)
  })
}

// Middleware
app.use(express.static(path.join(__dirname, "public")))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(
  fileUpload({
    createParentPath: true,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    useTempFiles: true,
    tempFileDir: "/tmp/",
    preserveExtension: true,
    safeFileNames: false, // Mantieni nomi originali
    parseNested: true,
  }),
)
app.use(
  session({
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
  }),
)

// Debug middleware per sessioni
app.use((req, res, next) => {
  if (req.path === "/upload" || req.path.startsWith("/api/")) {
    console.log(`🔍 ${req.method} ${req.path} - Session:`, {
      hasSession: !!req.session,
      hasUser: !!req.session?.user,
      userId: req.session?.user?.id,
      userRole: req.session?.user?.role,
    })
  }
  next()
})

// Auth middleware
function requireLogin(req, res, next) {
  console.log("🔐 Controllo autenticazione:", {
    hasSession: !!req.session,
    hasUser: !!req.session?.user,
    path: req.path,
    method: req.method,
  })

  if (!req.session || !req.session.user) {
    console.log("❌ Sessione non valida o utente non trovato")

    if (req.xhr || req.headers.accept?.indexOf("json") > -1 || req.path.startsWith("/api/") || req.path === "/upload") {
      return res.status(401).json({
        error: "Autenticazione richiesta",
        message: "Sessione scaduta. Effettua nuovamente il login.",
        redirect: "/login.html",
      })
    }
    return res.redirect("/login.html?error=session_expired")
  }

  console.log("✅ Autenticazione valida per utente:", req.session.user.username)
  next()
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    if (req.xhr || req.headers.accept.indexOf("json") > -1) {
      return res.status(403).json({ error: "Admin access required" })
    }
    return res.redirect("/dashboard.html")
  }
  next()
}

// Routes
app.get("/", (req, res) => res.redirect("/login.html"))

app.post("/login", (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.redirect("/login.html?error=missing_fields")
  }

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
      console.error("Database error:", err)
      return res.redirect("/login.html?error=database_error")
    }

    if (user && verifyPassword(password, user.password)) {
      // Aggiorna ultimo login
      db.run("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", [user.id])

      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
      }
      res.redirect("/dashboard.html")
    } else {
      res.redirect("/login.html?error=invalid_credentials")
    }
  })
})

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destroy error:", err)
    }
    res.redirect("/login.html")
  })
})

// Enhanced file API with complete file system view
app.get("/api/files", requireLogin, (req, res) => {
  const baseFolder = path.join(__dirname, "public/uploads")
  const requestedFolder = path.join(baseFolder, req.query.folder || "")

  if (!fs.existsSync(requestedFolder)) {
    if (!fs.existsSync(baseFolder)) {
      fs.mkdirSync(baseFolder, { recursive: true })
    }
    return res.json([])
  }

  try {
    const items = fs.readdirSync(requestedFolder, { withFileTypes: true })
    const result = items.map((item) => {
      const fullPath = path.join(requestedFolder, item.name)
      const relPath = path.relative(baseFolder, fullPath).replace(/\\/g, "/")
      const stats = fs.statSync(fullPath)

      return {
        name: item.name,
        path: relPath,
        type: item.isDirectory() ? "folder" : "file",
        size: item.isDirectory() ? null : stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
      }
    })

    // Sort: folders first, then files alphabetically
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    res.json(result)
  } catch (error) {
    console.error("Error reading directory:", error)
    res.status(500).json({ error: "Failed to read directory" })
  }
})

// Funzione avanzata per ricreare PERFETTAMENTE la struttura del file system
function createPerfectFileSystemStructure(files, baseFolder) {
  const fileSystemMap = new Map()
  const allDirectories = new Set()
  const filesByDirectory = new Map()
  const directoryHierarchy = new Map()

  console.log("=== ANALISI PERFETTA STRUTTURA FILE SYSTEM ===")
  console.log(`📁 Base folder: ${baseFolder}`)
  console.log(`📄 File totali da processare: ${files.length}`)

  // FASE 1: Analisi completa e costruzione mappa gerarchica
  files.forEach((file, index) => {
    let fullRelativePath = file.name

    // DEBUG: Mostra tutte le proprietà del file
    console.log(`\n📄 File ${index + 1}: "${file.name}"`)
    console.log(`   📁 webkitRelativePath: "${file.webkitRelativePath || "NON DISPONIBILE"}"`)
    console.log(`   📄 originalFilename: "${file.originalFilename || "NON DISPONIBILE"}"`)
    console.log(`   🔍 Tutte le proprietà file:`, Object.keys(file))

    // PRIORITÀ ASSOLUTA al webkitRelativePath per cartelle
    if (file.webkitRelativePath && file.webkitRelativePath.trim() !== "") {
      fullRelativePath = file.webkitRelativePath
      console.log(`✅ CARTELLA RILEVATA - Usando webkitRelativePath: "${fullRelativePath}"`)
    } else if (file.originalFilename && file.originalFilename !== file.name && file.originalFilename.includes("/")) {
      // Fallback per originalFilename se contiene percorso
      fullRelativePath = file.originalFilename
      console.log(`✅ PERCORSO ALTERNATIVO - Usando originalFilename: "${fullRelativePath}"`)
    } else {
      console.log(`⚠️  NESSUN PERCORSO CARTELLA - File andrà nella root: "${fullRelativePath}"`)
    }

    // Normalizza il percorso mantenendo la struttura originale
    fullRelativePath = fullRelativePath.replace(/\\/g, "/").replace(/^\/+/, "")

    console.log(`🎯 Percorso finale calcolato: "${fullRelativePath}"`)

    // Analizza il percorso completo
    const pathSegments = fullRelativePath.split("/")
    const fileName = pathSegments[pathSegments.length - 1]
    const directorySegments = pathSegments.slice(0, -1)

    console.log(`   📂 Segmenti directory: [${directorySegments.join(" → ")}]`)
    console.log(`   📄 Nome file finale: "${fileName}"`)

    if (directorySegments.length > 0) {
      console.log(`   🎯 File andrà nella cartella: "${directorySegments.join("/")}"`)
    } else {
      console.log(`   🏠 File andrà nella ROOT`)
    }

    // Costruisci TUTTE le directory nel percorso (incluse quelle intermedie)
    let currentDirectoryPath = ""
    directorySegments.forEach((segment, segmentIndex) => {
      if (segmentIndex > 0) currentDirectoryPath += "/"
      currentDirectoryPath += segment

      allDirectories.add(currentDirectoryPath)
      console.log(`      📁 Directory mappata: "${currentDirectoryPath}"`)

      // Costruisci gerarchia
      const parentPath = segmentIndex > 0 ? directorySegments.slice(0, segmentIndex).join("/") : ""
      if (!directoryHierarchy.has(parentPath)) {
        directoryHierarchy.set(parentPath, new Set())
      }
      directoryHierarchy.get(parentPath).add(currentDirectoryPath)

      // Inizializza directory nella mappa file
      if (!filesByDirectory.has(currentDirectoryPath)) {
        filesByDirectory.set(currentDirectoryPath, [])
      }
    })

    // Assegna il file alla directory finale
    const finalDirectory = directorySegments.length > 0 ? directorySegments.join("/") : ""

    if (!filesByDirectory.has(finalDirectory)) {
      filesByDirectory.set(finalDirectory, [])
    }

    const fileInfo = {
      originalFile: file,
      fileName: fileName,
      fullPath: fullRelativePath,
      directory: finalDirectory,
      isRootFile: directorySegments.length === 0,
      pathSegments: pathSegments,
      directorySegments: directorySegments,
    }

    filesByDirectory.get(finalDirectory).push(fileInfo)
    fileSystemMap.set(fullRelativePath, fileInfo)

    console.log(`   ✅ File assegnato alla directory: "${finalDirectory || "ROOT"}"`)
    console.log(`   📍 Percorso completo finale: "${fullRelativePath}"`)
  })

  // FASE 2: Creazione fisica ordinata delle directory
  console.log("\n=== CREAZIONE FISICA STRUTTURA DIRECTORY ===")
  console.log(`📁 Directory totali da creare: ${allDirectories.size}`)

  const createdDirectories = new Set()
  const failedDirectories = new Set()

  // Ordina le directory per profondità (prima le più superficiali)
  const sortedDirectories = Array.from(allDirectories).sort((a, b) => {
    const depthA = a.split("/").length
    const depthB = b.split("/").length
    if (depthA !== depthB) return depthA - depthB
    return a.localeCompare(b)
  })

  console.log("\n📋 Ordine di creazione directory:")
  sortedDirectories.forEach((dir, index) => {
    const depth = dir.split("/").length
    const indent = "  ".repeat(depth)
    console.log(`${index + 1}. ${indent}📁 "${dir}" (profondità: ${depth})`)
  })

  // Crea le directory in ordine
  sortedDirectories.forEach((directoryPath) => {
    const fullDirectoryPath = path.join(baseFolder, directoryPath)
    const depth = directoryPath.split("/").length
    const indent = "  ".repeat(depth)

    console.log(`\n${indent}🏗️  Creando: "${directoryPath}"`)
    console.log(`${indent}   Percorso assoluto: ${fullDirectoryPath}`)

    try {
      // Verifica che la directory padre esista
      const parentDir = path.dirname(fullDirectoryPath)
      if (!fs.existsSync(parentDir)) {
        console.log(`${indent}   ⚠️  Directory padre mancante: ${parentDir}`)
        console.log(`${indent}   🔧 Creazione directory padre...`)
        fs.mkdirSync(parentDir, { recursive: true })
      }

      // Crea la directory
      if (!fs.existsSync(fullDirectoryPath)) {
        fs.mkdirSync(fullDirectoryPath, { recursive: true })
        console.log(`${indent}   ✅ Directory creata con successo`)
        createdDirectories.add(directoryPath)
      } else {
        console.log(`${indent}   ⚠️  Directory già esistente`)
        createdDirectories.add(directoryPath)
      }

      // Verifica finale
      const stats = fs.statSync(fullDirectoryPath)
      if (stats.isDirectory()) {
        console.log(`${indent}   ✅ Verifica: Directory valida e accessibile`)
      } else {
        console.log(`${indent}   ❌ Errore: Percorso esiste ma non è una directory`)
        failedDirectories.add(directoryPath)
      }
    } catch (error) {
      console.error(`${indent}   ❌ Errore creazione directory:`, error.message)
      failedDirectories.add(directoryPath)
    }
  })

  // FASE 3: Verifica struttura e generazione statistiche
  console.log("\n=== VERIFICA STRUTTURA FILE SYSTEM ===")

  const maxDepth = allDirectories.size > 0 ? Math.max(...Array.from(allDirectories).map((d) => d.split("/").length)) : 0
  const totalFiles = files.length
  const totalDirectories = allDirectories.size
  const rootFiles = filesByDirectory.get("") || []

  console.log("📊 STATISTICHE FINALI:")
  console.log(`   📁 Directory create: ${createdDirectories.size}/${totalDirectories}`)
  console.log(`   📄 File totali: ${totalFiles}`)
  console.log(`   📊 Profondità massima: ${maxDepth}`)
  console.log(`   🏠 File nella root: ${rootFiles.length}`)
  console.log(`   ❌ Directory fallite: ${failedDirectories.size}`)

  if (failedDirectories.size > 0) {
    console.log("❌ Directory non create:")
    failedDirectories.forEach((dir) => console.log(`   - ${dir}`))
  }

  // Mostra struttura ad albero finale
  console.log("\n🌳 STRUTTURA AD ALBERO FINALE:")
  console.log("📁 ROOT")

  // File nella root
  rootFiles.forEach((fileInfo) => {
    console.log(`   📄 ${fileInfo.fileName}`)
  })

  // Directory e contenuti
  sortedDirectories.forEach((dirPath) => {
    if (createdDirectories.has(dirPath)) {
      const depth = dirPath.split("/").length
      const indent = "  ".repeat(depth + 1)
      const dirName = dirPath.split("/").pop()
      const parentIndent = "  ".repeat(depth)

      console.log(`${parentIndent}📁 ${dirName}/`)

      const filesInDir = filesByDirectory.get(dirPath) || []
      filesInDir.forEach((fileInfo) => {
        console.log(`${indent}📄 ${fileInfo.fileName}`)
      })
    }
  })

  return {
    allDirectories: Array.from(allDirectories),
    createdDirectories: Array.from(createdDirectories),
    failedDirectories: Array.from(failedDirectories),
    filesByDirectory: filesByDirectory,
    fileSystemMap: fileSystemMap,
    directoryHierarchy: directoryHierarchy,
    totalDirectories: totalDirectories,
    totalFiles: totalFiles,
    maxDepth: maxDepth,
    rootFiles: rootFiles.length,
    success: failedDirectories.size === 0,
  }
}

// Enhanced upload with perfect folder structure creation
app.post("/upload", requireLogin, (req, res) => {
  console.log("=== RICHIESTA UPLOAD RICEVUTA ===");
  res.setHeader("Content-Type", "application/json");

  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nessun file caricato",
        message: "Nessun file è stato ricevuto dal server",
      });
    }

    // Estrai i file dalla richiesta
    let files = req.files.files;
    if (!files) {
      const fileKeys = Object.keys(req.files);
      if (fileKeys.length > 0) {
        files = req.files[fileKeys[0]];
      }
    }
    if (!files) {
      return res.status(400).json({
        success: false,
        error: "Nessun file trovato",
        message: "Nessun file è stato trovato nella richiesta",
      });
    }

    const destination = req.body && req.body.destination ? req.body.destination.replace(/^\/+|\/+$/g, "") : "";
    const baseFolder = path.join(__dirname, "public/uploads");
    if (!fs.existsSync(baseFolder)) {
      fs.mkdirSync(baseFolder, { recursive: true });
    }

    const fileArray = Array.isArray(files) ? files : [files];
    const uploadResults = [];

    Promise.all(fileArray.map((file, index) => {
      return new Promise((resolve) => {
        // Usa SEMPRE file.name come path relativo (es: CartellaA/file.txt)
        let targetRelativePath = file.name;
        if (destination) {
          targetRelativePath = path.join(destination, targetRelativePath).replace(/\\/g, "/");
        }
        targetRelativePath = targetRelativePath.replace(/^\/+/, "");
        const targetFullPath = path.join(baseFolder, targetRelativePath);
        const targetDirectory = path.dirname(targetFullPath);
        if (!fs.existsSync(targetDirectory)) {
          fs.mkdirSync(targetDirectory, { recursive: true });
        }
        file.mv(targetFullPath, (moveError) => {
          if (moveError) {
            uploadResults.push({
              filename: file.name,
              status: "error",
              error: moveError.message,
              originalPath: targetRelativePath,
            });
          } else {
            uploadResults.push({
              filename: file.name,
              status: "success",
              savedAs: path.relative(baseFolder, targetFullPath).replace(/\\/g, "/"),
            });
          }
          resolve();
        });
      });
    })).then(() => {
      const successful = uploadResults.filter(r => r.status === "success").length;
      const failed = uploadResults.filter(r => r.status === "error").length;
      return res.json({
        success: failed === 0,
        totalFiles: successful,
        results: uploadResults,
        message: failed === 0 ? "Caricamento completato" : `Caricamento completato con ${failed} errori`
      });
    }).catch(error => {
      return res.status(500).json({
        success: false,
        totalFiles: 0,
        results: uploadResults,
        message: "Errore durante il caricamento dei file",
        error: error.message || error
      });
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      totalFiles: 0,
      results: [],
      message: "Errore server critico",
      error: error.message || error
    });
  }
});

// Funzione helper per generare struttura ad albero perfetta
function generatePerfectTreeStructure(directories, fileDistribution) {
  const tree = {
    name: "ROOT",
    type: "directory",
    path: "",
    children: [],
    files: fileDistribution.get("ROOT") || [],
    fileCount: (fileDistribution.get("ROOT") || []).length,
  }

  const sortedDirs = directories.sort()

  sortedDirs.forEach((dirPath) => {
    const parts = dirPath.split("/")
    let current = tree

    parts.forEach((part, index) => {
      const currentPath = parts.slice(0, index + 1).join("/")
      let found = current.children.find((child) => child.name === part)

      if (!found) {
        const filesInDir = fileDistribution.get(currentPath) || []
        found = {
          name: part,
          type: "directory",
          path: currentPath,
          children: [],
          files: filesInDir,
          fileCount: filesInDir.length,
          depth: index + 1,
        }
        current.children.push(found)
      }

      current = found
    })
  })

  return tree
}

app.get("/download/*", requireLogin, (req, res) => {
  const baseFolder = path.join(__dirname, "public/uploads")
  const filePath = path.normalize(path.join(baseFolder, req.params[0]))
  if (!filePath.startsWith(baseFolder)) return res.status(403).end()

  if (fs.existsSync(filePath)) {
    res.download(filePath)
  } else {
    res.status(404).send("File not found")
  }
})

// Enhanced delete with database cleanup
app.delete("/api/delete/*", requireLogin, (req, res) => {
  if (req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" })
  }

  const baseFolder = path.join(__dirname, "public/uploads")
  const filePath = path.normalize(path.join(baseFolder, req.params[0]))

  if (!filePath.startsWith(baseFolder)) {
    return res.status(403).json({ error: "Invalid path" })
  }

  if (fs.existsSync(filePath)) {
    try {
      const stats = fs.statSync(filePath)
      const relativePath = path.relative(baseFolder, filePath).replace(/\\/g, "/")

      // Elimina file/cartella dal filesystem
      fs.rmSync(filePath, { recursive: true, force: true })

      // Elimina record dal database
      if (stats.isFile()) {
        db.run("DELETE FROM file_uploads WHERE filepath = ?", [relativePath])
      } else {
        // Se è una cartella, elimina tutti i file che iniziano con quel percorso
        db.run("DELETE FROM file_uploads WHERE filepath LIKE ?", [`${relativePath}/%`])
      }

      console.log(`✅ Eliminato: ${filePath}`)
      res.json({ success: true, message: "Eliminazione completata" })
    } catch (error) {
      console.error("❌ Errore eliminazione:", error)
      res.status(500).json({ error: "Delete failed", message: error.message })
    }
  } else {
    res.status(404).json({ error: "File not found" })
  }
})

// Delete all files and folders
app.delete("/api/delete-all", requireAdmin, (req, res) => {
  const baseFolder = path.join(__dirname, "public/uploads")

  try {
    if (fs.existsSync(baseFolder)) {
      // Elimina tutti i file e cartelle
      fs.rmSync(baseFolder, { recursive: true, force: true })
      // Ricrea la cartella vuota
      fs.mkdirSync(baseFolder, { recursive: true })
    }

    // Elimina tutti i record dal database
    db.run("DELETE FROM file_uploads", (err) => {
      if (err) {
        console.error("❌ Errore pulizia database:", err)
        return res.status(500).json({ error: "Database cleanup failed" })
      }

      console.log("🗑️  Eliminati tutti i file e dati")
      res.json({ success: true, message: "Tutti i file e dati sono stati eliminati" })
    })
  } catch (error) {
    console.error("❌ Errore eliminazione completa:", error)
    res.status(500).json({ error: "Delete all failed", message: error.message })
  }
})

// User management routes (Admin only) with enhanced admin protection
app.get("/api/users", requireAdmin, (req, res) => {
  db.all("SELECT id, username, role, created_at, last_login FROM users ORDER BY role DESC, username", (err, rows) => {
    if (err) {
      res.status(500).json({ error: "Database error" })
    } else {
      // Aggiungi informazioni sui permessi per ogni utente
      countAdmins((countErr, adminCount) => {
        if (countErr) {
          return res.status(500).json({ error: "Error counting admins" })
        }

        const usersWithPermissions = rows.map((user) => ({
          ...user,
          canDelete: user.role !== "admin" || adminCount.count > 1,
          canChangeRole: user.role !== "admin" || adminCount.count > 1,
          isProtected: user.role === "admin" && adminCount.count === 1,
        }))

        res.json({
          users: usersWithPermissions,
          adminCount: adminCount.count,
          totalUsers: rows.length,
        })
      })
    }
  })
})

app.post("/create-user", requireAdmin, (req, res) => {
  const { username, password, role } = req.body

  if (!username || !password || !role) {
    return res.redirect("/admin.html?error=missing_fields")
  }

  // Valida password
  const passwordErrors = validatePassword(password)
  if (passwordErrors.length > 0) {
    return res.redirect(`/admin.html?error=weak_password&details=${encodeURIComponent(passwordErrors.join(", "))}`)
  }

  // Creazione libera di utenti e admin
  const hashedPassword = hashPassword(password)

  db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, hashedPassword, role], (err) => {
    if (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        res.redirect("/admin.html?error=user_exists")
      } else {
        console.error("Database error:", err)
        res.redirect("/admin.html?error=database_error")
      }
    } else {
      console.log(`✅ Utente creato: ${username} (${role})`)
      if (role === "admin") {
        console.log("👑 Nuovo amministratore aggiunto al sistema")
      }
      res.redirect("/admin.html?success=user_created")
    }
  })
})

app.post("/update-user", requireAdmin, (req, res) => {
  const { id, username, password, role } = req.body

  if (!id || !username || !role) {
    return res.redirect("/admin.html?error=missing_fields")
  }

  // Valida password se fornita
  if (password) {
    const passwordErrors = validatePassword(password)
    if (passwordErrors.length > 0) {
      return res.redirect(`/admin.html?error=weak_password&details=${encodeURIComponent(passwordErrors.join(", "))}`)
    }
  }

  // Controlla se si sta tentando di cambiare un admin a user
  db.get("SELECT role FROM users WHERE id = ?", [id], (err, user) => {
    if (err) {
      console.error("Database error:", err)
      return res.redirect("/admin.html?error=database_error")
    }

    if (!user) {
      return res.redirect("/admin.html?error=user_not_found")
    }

    // Se l'utente è admin e si sta tentando di cambiarlo a user
    if (user.role === "admin" && role === "user") {
      canChangeAdminToUser(id, (canChangeErr, canChange) => {
        if (canChangeErr) {
          console.error("Error checking admin change permission:", canChangeErr)
          return res.redirect("/admin.html?error=database_error")
        }

        if (!canChange) {
          return res.redirect(
            "/admin.html?error=cannot_change_last_admin&details=Non puoi cambiare l'ultimo amministratore in utente",
          )
        }

        updateUserInDatabase()
      })
    } else {
      updateUserInDatabase()
    }

    function updateUserInDatabase() {
      let query, params
      if (password) {
        const hashedPassword = hashPassword(password)
        query = "UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?"
        params = [username, hashedPassword, role, id]
      } else {
        query = "UPDATE users SET username = ?, role = ? WHERE id = ?"
        params = [username, role, id]
      }

      db.run(query, params, (updateErr) => {
        if (updateErr) {
          console.error("Database error:", updateErr)
          res.redirect("/admin.html?error=update_failed")
        } else {
          console.log(`✅ Utente aggiornato: ${username} (${role})`)
          res.redirect("/admin.html?success=user_updated")
        }
      })
    }
  })
})

app.post("/delete-user", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.body.id)

  if (!id) {
    return res.redirect("/admin.html?error=invalid_user_id")
  }

  // Controlla se l'utente è admin e se può essere eliminato
  db.get("SELECT role FROM users WHERE id = ?", [id], (err, user) => {
    if (err) {
      console.error("Database error:", err)
      return res.redirect("/admin.html?error=database_error")
    }

    if (!user) {
      return res.redirect("/admin.html?error=user_not_found")
    }

    if (user.role === "admin") {
      canDeleteAdmin(id, (canDeleteErr, canDelete) => {
        if (canDeleteErr) {
          console.error("Error checking admin delete permission:", canDeleteErr)
          return res.redirect("/admin.html?error=database_error")
        }

        if (!canDelete) {
          return res.redirect(
            "/admin.html?error=cannot_delete_last_admin&details=Non puoi eliminare l'ultimo amministratore",
          )
        }

        deleteUserFromDatabase()
      })
    } else {
      deleteUserFromDatabase()
    }

    function deleteUserFromDatabase() {
      db.run("DELETE FROM users WHERE id = ?", [id], (deleteErr) => {
        if (deleteErr) {
          console.error("Database error:", deleteErr)
          res.redirect("/admin.html?error=delete_failed")
        } else {
          console.log(`✅ Utente eliminato: ID ${id}`)
          res.redirect("/admin.html?success=user_deleted")
        }
      })
    }
  })
})

app.get("/session-info", (req, res) => {
  const role = req.session?.user?.role || "guest"
  const username = req.session?.user?.username || "guest"
  res.json({ role, username })
})

// Endpoint per verificare sessione
app.get("/api/session-check", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      valid: false,
      message: "Sessione non valida",
    })
  }

  res.json({
    valid: true,
    user: {
      id: req.session.user.id,
      username: req.session.user.username,
      role: req.session.user.role,
    },
  })
})

// WebSocket for real-time updates
io.on("connection", (socket) => {
  console.log("Client connected for real-time updates")

  socket.on("disconnect", () => {
    console.log("Client disconnected")
  })
})

app.post("/api/create-folder", requireLogin, (req, res) => {
  const folderRelPath = req.body?.path
  if (!folderRelPath || folderRelPath.includes("..")) {
    return res.status(400).json({ success: false, message: "Percorso non valido" })
  }

  const baseFolder = path.join(__dirname, "public/uploads")
  const fullPath = path.join(baseFolder, folderRelPath)

  try {
    fs.mkdirSync(fullPath, { recursive: true })
    console.log("📁 Cartella creata:", fullPath)
    res.json({ success: true })
  } catch (err) {
    console.error("Errore creazione cartella:", err)
    res.status(500).json({ success: false, message: "Errore interno" })
  }
})

app.get("/download-folder", requireLogin, (req, res) => {
  const folderPath = path.join(__dirname, "public/uploads", req.query.folder || "")
  const zipName = path.basename(folderPath) + ".zip"

  res.setHeader("Content-Disposition", `attachment; filename=${zipName}`)
  res.setHeader("Content-Type", "application/zip")

  const archive = archiver("zip", { zlib: { level: 9 } })
  archive.pipe(res)
  archive.directory(folderPath, false)
  archive.finalize()
})

// API ricorsiva per struttura ad albero
app.get("/api/tree", requireLogin, (req, res) => {
  const baseFolder = path.join(__dirname, "public/uploads");
  const startFolder = req.query.folder ? path.join(baseFolder, req.query.folder) : baseFolder;

  function readTree(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    const result = { folders: {}, files: [] };
    items.forEach(item => {
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


const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`)
  console.log("👤 Admin credentials: admin / Admin123!")
  console.log("🔒 Password requirements: 8+ chars, uppercase, lowercase, number, special char")
  console.log("🛡️  Admin protection: Last admin cannot be deleted or demoted")
})
