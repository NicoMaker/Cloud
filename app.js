const express = require('express');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fileUpload = require('express-fileupload');
const fs = require('fs');

const app = express();
const dbFile = './db/database.sqlite';
const db = new sqlite3.Database(dbFile);

// Initialize DB if needed
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

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(session({
  secret: 'cloudsecret',
  resave: false,
  saveUninitialized: true
}));

// Routes
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
  if (!fs.existsSync(userFolder)) return res.json([]);
  const files = fs.readdirSync(userFolder);
  res.json(files);
});

app.post('/upload', (req, res) => {
  if (!req.session.user || !req.files) return res.redirect('/login.html');
  const userFolder = path.join(__dirname, 'public/uploads', req.session.user.username);
  if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder, { recursive: true });

  const files = Array.isArray(req.files.file) ? req.files.file : [req.files.file];

  files.forEach(file => {
    file.mv(path.join(userFolder, file.name));
  });

  res.redirect('/dashboard.html');
});

app.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'public/uploads', req.session.user.username, req.params.filename);
  res.download(filePath);
});

app.get('/delete/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'public/uploads', req.session.user.username, req.params.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.redirect('/dashboard.html');
});

app.listen(3000, () => {
  console.log("Server avviato su http://localhost:3000");
});