
const express = require('express');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fileUpload = require('express-fileupload');
const fs = require('fs');

const app = express();
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const dbFile = path.join(dbDir, 'database.db');
const db = new sqlite3.Database(dbFile);

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

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login.html');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/dashboard.html');
  }
  next();
}

app.get('/', (req, res) => res.redirect('/login.html'));

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

app.post('/create-user', requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.redirect('/admin.html');
  db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, password, role], (err) => {
    return res.redirect('/admin.html');
  });
});

app.get('/api/files', requireLogin, (req, res) => {
  const baseFolder = path.join(__dirname, 'public/uploads');
  const requestedFolder = path.join(baseFolder, req.query.folder || '');
  if (!fs.existsSync(requestedFolder)) return res.json([]);

  const items = fs.readdirSync(requestedFolder, { withFileTypes: true });
  const result = items.map(item => {
    const fullPath = path.join(requestedFolder, item.name);
    const relPath = path.relative(baseFolder, fullPath).replace(/\\/g, '/');
    return {
      name: item.name,
      path: relPath,
      type: item.isDirectory() ? 'folder' : 'file'
    };
  });

  res.json(result);
});

app.post('/upload', requireLogin, (req, res) => {
  if (!req.files) return res.redirect('/dashboard.html');

  const baseFolder = path.join(__dirname, 'public/uploads');
  const files = Array.isArray(req.files.file) ? req.files.file : [req.files.file];

  files.forEach(file => {
    const relativePath = file.name.replace(/\\/g, '/');
    const fullPath = path.join(baseFolder, relativePath);
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
      if (err) console.error("Errore salvataggio:", err);
    });
  });

  res.redirect('/dashboard.html');
});

app.get('/download/*', requireLogin, (req, res) => {
  const baseFolder = path.join(__dirname, 'public/uploads');
  const filePath = path.normalize(path.join(baseFolder, req.params[0]));
  if (!filePath.startsWith(baseFolder)) return res.status(403).end();
  res.download(filePath);
});

app.get('/delete/*', requireLogin, (req, res) => {
  if (req.session.user.role !== 'admin') return res.redirect('/dashboard.html');
  const baseFolder = path.join(__dirname, 'public/uploads');
  const filePath = path.normalize(path.join(baseFolder, req.params[0]));
  if (!filePath.startsWith(baseFolder)) return res.redirect('/dashboard.html');
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { recursive: true, force: true });
  }
  res.redirect('/dashboard.html');
});

app.listen(3000, () => {
  console.log("✅ Server attivo su http://localhost:3000");
});

// extra routes
app.get('/api/users', requireAdmin, (req, res) => {
  db.all("SELECT id, username, role FROM users", (err, rows) => {
    res.json(rows);
  });
});

app.post('/delete-user', requireAdmin, (req, res) => {
  const id = parseInt(req.body.id);
  db.run("DELETE FROM users WHERE id = ?", [id], () => {
    res.redirect('/admin.html');
  });
});

app.post('/update-user', requireAdmin, (req, res) => {
  const { id, username, password, role } = req.body;
  if (!id || !username || !role) return res.redirect('/admin.html');
  const params = [username, role, id];
  let sql = "UPDATE users SET username = ?, role = ?";

  if (password && password.trim() !== '') {
    sql = "UPDATE users SET username = ?, role = ?, password = ?";
    params.splice(2, 0, password); // insert password at index 2
    params.push(id); // id again for WHERE
  }

  sql += " WHERE id = ?";
  db.run(sql, params, () => {
    res.redirect('/admin.html');
  });
});
