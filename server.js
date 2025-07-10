const express = require("express")
const session = require("express-session")
const path = require("path")
const sqlite3 = require("sqlite3").verbose()
const fileUpload = require("express-fileupload")
const fs = require("fs")
const http = require("http")
const socketIo = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = socketIo(server)

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
      role TEXT NOT NULL DEFAULT 'user'
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

  db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO users (username, password, role) VALUES ('admin', '1234', 'admin')")
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
    secret: "cloudsecret",
    resave: false,
    saveUninitialized: true,
  }),
)

// Auth middleware
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login.html")
  next()
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/dashboard.html")
  }
  next()
}

// Routes
app.get("/", (req, res) => res.redirect("/login.html"))

app.post("/login", (req, res) => {
  const { username, password } = req.body
  db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, user) => {
    if (user) {
      req.session.user = user
      res.redirect("/dashboard.html")
    } else {
      res.redirect("/login.html?error=1")
    }
  })
})

app.get("/logout", (req, res) => {
  req.session.destroy()
  res.redirect("/login.html")
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
    res.json([])
  }
})

// Enhanced upload with progress tracking
app.post("/upload", requireLogin, (req, res) => {
  console.log("=== UPLOAD REQUEST RECEIVED ===")

  // Set JSON response headers immediately
  res.setHeader("Content-Type", "application/json")

  try {
    console.log("Request files:", req.files)
    console.log("Request body:", req.body)

    if (!req.files) {
      console.log("No files found in request")
      return res.status(400).json({
        success: false,
        error: "No files uploaded",
        message: "No files were received by the server"
      })
    }

    // Handle different field names - be more flexible
    let files = null
    if (req.files.files) {
      files = req.files.files
    } else {
      // Get the first available file field
      const fileKeys = Object.keys(req.files)
      if (fileKeys.length > 0) {
        files = req.files[fileKeys[0]]
        console.log(`Using file field: ${fileKeys[0]}`)
      }
    }

    if (!files) {
      console.log("No files found in any field")
      return res.status(400).json({
        success: false,
        error: "No files found",
        message: "No files were found in the request"
      })
    }

    const baseFolder = path.join(__dirname, "public/uploads")
    if (!fs.existsSync(baseFolder)) {
      console.log("Creating uploads directory")
      fs.mkdirSync(baseFolder, { recursive: true })
    }

    // Handle both single and multiple files
    const fileArray = Array.isArray(files) ? files : [files]
    console.log(`Processing ${fileArray.length} files`)

    if (fileArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Empty file array",
        message: "No files to process"
      })
    }

    const uploadResults = []
    let processedCount = 0

    const processFile = (file, index) => {
      return new Promise((resolve) => {
        try {
          console.log(`Processing file ${index + 1}:`, {
            name: file.name,
            size: file.size,
            mimetype: file.mimetype,
          })

          // Get the relative path from the file name
          let relativePath = file.name.replace(/\\/g, "/")

          // Remove any leading slashes
          relativePath = relativePath.replace(/^\/+/, "")

          const fullPath = path.join(baseFolder, relativePath)
          console.log(`Target path: ${fullPath}`)

          // Security check - make sure the path is within uploads folder
          const normalizedPath = path.normalize(fullPath)
          if (!normalizedPath.startsWith(path.normalize(baseFolder))) {
            console.error(`Security violation: ${normalizedPath} is outside ${baseFolder}`)
            processedCount++
            uploadResults.push({
              filename: file.name,
              status: "error",
              error: "Invalid file path"
            })
            resolve()
            return
          }

          // Create directory structure
          const dirPath = path.dirname(fullPath)
          if (!fs.existsSync(dirPath)) {
            console.log(`Creating directory: ${dirPath}`)
            fs.mkdirSync(dirPath, { recursive: true })
          }

          // Handle file name conflicts
          let targetPath = fullPath
          let count = 1
          const ext = path.extname(fullPath)
          const base = path.basename(fullPath, ext)
          const dir = path.dirname(fullPath)

          while (fs.existsSync(targetPath)) {
            targetPath = path.join(dir, `${base}_${count}${ext}`)
            count++
          }

          // Move file to final location
          file.mv(targetPath, (err) => {
            processedCount++

            if (err) {
              console.error(`Error moving file ${file.name}:`, err)
              uploadResults.push({
                filename: file.name,
                status: "error",
                error: err.message,
              })
            } else {
              console.log(`File saved successfully: ${targetPath}`)

              // Save to database
              const relativeDbPath = path.relative(baseFolder, targetPath).replace(/\\/g, "/")
              db.run(
                "INSERT INTO file_uploads (filename, filepath, filesize, user_id) VALUES (?, ?, ?, ?)",
                [path.basename(targetPath), relativeDbPath, file.size, req.session.user.id],
                (dbErr) => {
                  if (dbErr) {
                    console.error("Database error:", dbErr)
                  }
                },
              )

              uploadResults.push({
                filename: file.name,
                status: "success",
                path: relativeDbPath,
              })
            }

            // Send progress update
            const percentage = Math.round((processedCount / fileArray.length) * 100)
            io.emit("uploadProgress", {
              processed: processedCount,
              total: fileArray.length,
              percentage: percentage,
            })

            resolve()
          })
        } catch (error) {
          console.error(`Processing error for file ${file.name}:`, error)
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

    // Process all files
    Promise.all(fileArray.map((file, index) => processFile(file, index)))
      .then(() => {
        console.log("=== UPLOAD COMPLETED ===")
        console.log(`Processed: ${processedCount}/${fileArray.length}`)
        console.log("Results:", uploadResults)

        const successCount = uploadResults.filter((r) => r.status === "success").length
        const errorCount = uploadResults.filter((r) => r.status === "error").length

        // Always return JSON response
        const response = {
          success: successCount > 0,
          results: uploadResults,
          message: `${successCount} of ${fileArray.length} files uploaded successfully`,
          total: fileArray.length,
          successful: successCount,
          errors: errorCount
        }

        console.log("Sending response:", response)
        res.json(response)
      })
      .catch((error) => {
        console.error("Upload process error:", error)
        res.status(500).json({
          success: false,
          error: "Upload process failed",
          message: error.message,
        })
      })

  } catch (error) {
    console.error("Upload handler error:", error)
    res.status(500).json({
      success: false,
      error: "Server error",
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
      fs.rmSync(filePath, { recursive: true, force: true })
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: "Delete failed" })
    }
  } else {
    res.status(404).json({ error: "File not found" })
  }
})

// User management routes (Admin only)
app.get("/api/users", requireAdmin, (req, res) => {
  db.all("SELECT id, username, password, role FROM users", (err, rows) => {
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

  db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, password, role], (err) => {
    if (err) {
      res.redirect("/admin.html?error=user_exists")
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

  db.run(
    "UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?",
    [username, password, role, id],
    (err) => {
      if (err) {
        res.redirect("/admin.html?error=update_failed")
      } else {
        res.redirect("/admin.html?success=user_updated")
      }
    },
  )
})

app.post("/delete-user", requireAdmin, (req, res) => {
  const id = Number.parseInt(req.body.id)
  if (id === 1) {
    // Protect admin user
    return res.redirect("/admin.html?error=cannot_delete_admin")
  }

  db.run("DELETE FROM users WHERE id = ?", [id], (err) => {
    if (err) {
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
  console.log("👤 Admin credentials: admin / 1234")
})
