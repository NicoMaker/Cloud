const express = require("express")
const session = require("express-session")
const path = require("path")
const sqlite3 = require("sqlite3").verbose()
const fileUpload = require("express-fileupload")
const fs = require("fs")
const http = require("http")
const socketIo = require("socket.io")
const crypto = require("crypto")

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

  // Crea admin con password sicura se non esiste
  db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
    if (!row) {
      const hashedPassword = hashPassword("Admin123!")
      db.run("INSERT INTO users (username, password, role) VALUES ('admin', ?, 'admin')", [hashedPassword])
      console.log("👤 Admin creato con password: Admin123!")
    }
  })
})

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
  }),
)
app.use(
  session({
    secret: crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    rolling: true, // Rinnova la sessione ad ogni richiesta
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax", // Aiuta con le richieste AJAX
    },
    name: "filemanager.sid", // Nome personalizzato per il cookie
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

// Funzione per creare la struttura completa delle cartelle
function createDirectoryStructure(files, baseFolder) {
  const createdDirs = new Set()

  console.log("=== CREAZIONE STRUTTURA CARTELLE ===")
  console.log(`Base folder: ${baseFolder}`)

  files.forEach((file, index) => {
    let filePath = file.name

    // Usa webkitRelativePath se disponibile
    if (file.webkitRelativePath && file.webkitRelativePath !== file.name) {
      filePath = file.webkitRelativePath
    }

    filePath = filePath.replace(/\\/g, "/")
    console.log(`File ${index + 1}: ${filePath}`)

    if (filePath.includes("/")) {
      const dirPath = filePath.substring(0, filePath.lastIndexOf("/"))
      console.log(`  -> Cartella necessaria: ${dirPath}`)

      const pathParts = dirPath.split("/")
      let currentPath = ""

      pathParts.forEach((part, partIndex) => {
        currentPath += (partIndex > 0 ? "/" : "") + part
        const fullDirPath = path.join(baseFolder, currentPath)

        console.log(`    Controllo cartella: ${currentPath} -> ${fullDirPath}`)

        if (!createdDirs.has(currentPath) && !fs.existsSync(fullDirPath)) {
          console.log(`    ✅ Creando: ${fullDirPath}`)
          fs.mkdirSync(fullDirPath, { recursive: true })
          createdDirs.add(currentPath)
        } else if (fs.existsSync(fullDirPath)) {
          console.log(`    ⚠️  Già esistente: ${fullDirPath}`)
          createdDirs.add(currentPath)
        }
      })
    } else {
      console.log(`  -> File nella radice: ${filePath}`)
    }
  })

  console.log(`\n📁 Cartelle create/verificate: ${createdDirs.size}`)
  Array.from(createdDirs)
    .sort()
    .forEach((dir) => {
      console.log(`  📂 ${dir}`)
    })

  return createdDirs
}

// Enhanced upload with complete folder structure creation
app.post("/upload", requireLogin, (req, res) => {
  console.log("=== RICHIESTA UPLOAD RICEVUTA ===")
  console.log("👤 Utente autenticato:", req.session.user.username, `(${req.session.user.role})`)
  console.log("📊 Headers richiesta:", {
    "content-type": req.headers["content-type"],
    "content-length": req.headers["content-length"],
    "user-agent": req.headers["user-agent"]?.substring(0, 50) + "...",
  })

  // IMPORTANTE: Imposta sempre header JSON
  res.setHeader("Content-Type", "application/json")

  try {
    if (!req.files) {
      console.log("Nessun file trovato nella richiesta")
      return res.status(400).json({
        success: false,
        error: "Nessun file caricato",
        message: "Nessun file è stato ricevuto dal server",
      })
    }

    let files = null
    if (req.files.files) {
      files = req.files.files
    } else {
      const fileKeys = Object.keys(req.files)
      if (fileKeys.length > 0) {
        files = req.files[fileKeys[0]]
        console.log(`Usando campo file: ${fileKeys[0]}`)
      }
    }

    if (!files) {
      console.log("Nessun file trovato in nessun campo")
      return res.status(400).json({
        success: false,
        error: "Nessun file trovato",
        message: "Nessun file è stato trovato nella richiesta",
      })
    }

    const baseFolder = path.join(__dirname, "public/uploads")
    if (!fs.existsSync(baseFolder)) {
      console.log("Creando directory uploads")
      fs.mkdirSync(baseFolder, { recursive: true })
    }

    const fileArray = Array.isArray(files) ? files : [files]
    console.log(`Processando ${fileArray.length} file`)

    if (fileArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Array file vuoto",
        message: "Nessun file da processare",
      })
    }

    // FASE 1: Crea struttura cartelle
    console.log("=== FASE 1: CREAZIONE STRUTTURA CARTELLE ===")
    const createdDirs = createDirectoryStructure(fileArray, baseFolder)

    const uploadResults = []
    let processedCount = 0

    const processFile = (file, index) => {
      return new Promise((resolve) => {
        try {
          console.log(`\n--- Processando file ${index + 1}/${fileArray.length} ---`)
          console.log(`Nome file originale: ${file.name}`)
          console.log(`webkitRelativePath: ${file.webkitRelativePath || "non disponibile"}`)

          let relativePath = file.name

          if (file.webkitRelativePath && file.webkitRelativePath !== file.name) {
            relativePath = file.webkitRelativePath
            console.log(`Usando webkitRelativePath: ${relativePath}`)
          }

          relativePath = relativePath.replace(/\\/g, "/")
          relativePath = relativePath.replace(/^\/+/, "")

          const fullPath = path.join(baseFolder, relativePath)
          console.log(`Percorso finale: ${fullPath}`)

          // Security check
          const normalizedPath = path.normalize(fullPath)
          if (!normalizedPath.startsWith(path.normalize(baseFolder))) {
            console.error(`❌ Violazione sicurezza: ${normalizedPath}`)
            processedCount++
            uploadResults.push({
              filename: file.name,
              status: "error",
              error: "Percorso file non valido",
            })
            resolve()
            return
          }

          const dirPath = path.dirname(fullPath)
          if (!fs.existsSync(dirPath)) {
            console.log(`⚠️  Cartella mancante, creazione: ${dirPath}`)
            fs.mkdirSync(dirPath, { recursive: true })
          }

          // Gestisci conflitti nomi file
          let targetPath = fullPath
          let count = 1
          const ext = path.extname(fullPath)
          const base = path.basename(fullPath, ext)
          const dir = path.dirname(fullPath)

          while (fs.existsSync(targetPath)) {
            targetPath = path.join(dir, `${base}_${count}${ext}`)
            count++
          }

          console.log(`📁 Spostamento da temp a: ${targetPath}`)
          file.mv(targetPath, (err) => {
            processedCount++

            if (err) {
              console.error(`❌ Errore spostamento ${file.name}:`, err)
              uploadResults.push({
                filename: file.name,
                status: "error",
                error: err.message,
              })
            } else {
              console.log(`✅ File salvato: ${targetPath}`)

              const relativeDbPath = path.relative(baseFolder, targetPath).replace(/\\/g, "/")

              db.run(
                "INSERT INTO file_uploads (filename, filepath, filesize, user_id) VALUES (?, ?, ?, ?)",
                [path.basename(targetPath), relativeDbPath, file.size, req.session.user.id],
                (dbErr) => {
                  if (dbErr) {
                    console.error("❌ Errore database:", dbErr)
                  } else {
                    console.log(`✅ Registrato nel DB: ${relativeDbPath}`)
                  }
                },
              )

              uploadResults.push({
                filename: file.name,
                status: "success",
                path: relativeDbPath,
                originalPath: relativePath,
                folder: path.dirname(relativeDbPath) !== "." ? path.dirname(relativeDbPath) : null,
              })
            }

            const percentage = Math.round((processedCount / fileArray.length) * 100)
            io.emit("uploadProgress", {
              processed: processedCount,
              total: fileArray.length,
              percentage: percentage,
            })

            resolve()
          })
        } catch (error) {
          console.error(`❌ Errore processamento ${file.name}:`, error)
          processedCount++
          uploadResults.push({
            filename: file.name,
            status: "error",
            error: error.message,
          })
          resolve()
        }
      })
    }

    // FASE 2: Processa file
    console.log("\n=== FASE 2: PROCESSAMENTO FILE ===")
    Promise.all(fileArray.map((file, index) => processFile(file, index)))
      .then(() => {
        console.log("\n=== UPLOAD COMPLETATO ===")

        const successCount = uploadResults.filter((r) => r.status === "success").length
        const errorCount = uploadResults.filter((r) => r.status === "error").length

        const response = {
          success: successCount > 0,
          results: uploadResults,
          message: `${successCount} di ${fileArray.length} file caricati con successo. ${createdDirs.size} cartelle create.`,
          total: fileArray.length,
          successful: successCount,
          errors: errorCount,
          foldersCreated: createdDirs.size,
          folderStructure: Array.from(createdDirs),
        }

        console.log("✅ Invio risposta JSON:", response)
        res.json(response)
      })
      .catch((error) => {
        console.error("❌ Errore processo upload:", error)
        res.status(500).json({
          success: false,
          error: "Processo upload fallito",
          message: error.message,
        })
      })
  } catch (error) {
    console.error("❌ Errore handler upload:", error)
    res.status(500).json({
      success: false,
      error: "Errore server",
      message: error.message,
    })
  }
})

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

// User management routes (Admin only)
app.get("/api/users", requireAdmin, (req, res) => {
  db.all("SELECT id, username, role, created_at, last_login FROM users", (err, rows) => {
    if (err) {
      res.status(500).json({ error: "Database error" })
    } else {
      res.json(rows)
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

  let query, params
  if (password) {
    const hashedPassword = hashPassword(password)
    query = "UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?"
    params = [username, hashedPassword, role, id]
  } else {
    query = "UPDATE users SET username = ?, role = ? WHERE id = ?"
    params = [username, role, id]
  }

  db.run(query, params, (err) => {
    if (err) {
      console.error("Database error:", err)
      res.redirect("/admin.html?error=update_failed")
    } else {
      res.redirect("/admin.html?success=user_updated")
    }
  })
})

app.post("/delete-user", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.body.id)

  if (id === 1) {
    return res.redirect("/admin.html?error=cannot_delete_admin")
  }

  db.run("DELETE FROM users WHERE id = ?", [id], (err) => {
    if (err) {
      console.error("Database error:", err)
      res.redirect("/admin.html?error=delete_failed")
    } else {
      res.redirect("/admin.html?success=user_deleted")
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

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`)
  console.log("👤 Admin credentials: admin / Admin123!")
  console.log("🔒 Password requirements: 8+ chars, uppercase, lowercase, number, special char")
})
