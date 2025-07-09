const express = require('express');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fileUpload = require('express-fileupload');
const fs = require('fs');

const app = express();

// Ensure 'db/' directory exists
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const dbFile = path.join(dbDir, 'database.sqlite'); // ✅ corretto .sqlite
const db = new sqlite3.Database(dbFile);

// Initialize database
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user'
    )
  `);
  db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO users (username, password, role) VALUES ('admin', '1234', 'admin')");
    }
  });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ createParentPath: true }));
app.use(session({
  secret: 'cloudsecret',
  resave: false,
  saveUninitialized: true
}));

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, user) => {
    if (user) {
      req.session.user = user;
      res.redirect('/dashboard.html');
    } else {
      res.redirect('/login.html');
    }
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login.html');
});

app.get('/api/files', (req, res) => {
  if (!req.session.user) return res.status(401).json([]);
  const userFolder = path.join(__dirname, 'public/uploads', req.session.user.username);
  const requestedFolder = path.join(userFolder, req.query.folder || '');

  if (!fs.existsSync(requestedFolder)) return res.json([]);

  const items = fs.readdirSync(requestedFolder, { withFileTypes: true });
  const result = items.map(item => {
    const fullPath = path.join(requestedFolder, item.name);
    const relPath = path.relative(userFolder, fullPath).replace(/\\/g, '/');
    return {
      name: item.name,
      path: relPath,
      type: item.isDirectory() ? 'folder' : 'file'
    };
  });

  res.json(result);
});

app.post('/upload', (req, res) => {
  if (!req.session.user || !req.files) return res.redirect('/login.html');

  const userFolder = path.join(__dirname, 'public/uploads', req.session.user.username);
  if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder, { recursive: true });

  const files = Array.isArray(req.files.file) ? req.files.file : [req.files.file];

  files.forEach(file => {
    const relativePath = file.name.replace(/\\\\/g, '/');
    const fullPath = path.join(userFolder, relativePath);
    const folderPath = path.dirname(fullPath);
    fs.mkdirSync(folderPath, { recursive: true });

    let targetPath = fullPath;
    let count = 1;
    const ext = path.extname(fullPath);
    const base = path.basename(fullPath, ext);
    const dir = path.dirname(fullPath);

    while (fs.existsSync(targetPath)) {
      targetPath = path.join(dir, `${base} (${count})${ext}`);
      count++;
    }

    file.mv(targetPath, (err) => {
      if (err) console.error("Errore nel salvataggio:", err);
    });
  });

  res.redirect('/dashboard.html');
});

app.get('/download/*', (req, res) => {
  if (!req.session.user) return res.status(401).end();
  const userFolder = path.join(__dirname, 'public/uploads', req.session.user.username);
  const filePath = path.normalize(path.join(userFolder, req.params[0]));
  if (!filePath.startsWith(userFolder)) return res.status(403).end();
  res.download(filePath);
});

app.get('/delete/*', (req, res) => {
  if (!req.session.user) return res.redirect('/login.html');
  const userFolder = path.join(__dirname, 'public/uploads', req.session.user.username);
  const filePath = path.normalize(path.join(userFolder, req.params[0]));
  if (!filePath.startsWith(userFolder)) return res.redirect('/dashboard.html');
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { recursive: true, force: true });
  }
  res.redirect('/dashboard.html');
});

app.listen(3000, () => {
  console.log("✅ Server avviato su http://localhost:3000");
});
