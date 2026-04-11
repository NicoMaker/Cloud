// =============================================
//  SETUP DATABASE
// =============================================

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const { hashPassword } = require("./1-passwordUtils");

function setupDatabase(__dirname) {
  const dbDir = path.join(__dirname, "db");
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

  const dbFile = path.join(dbDir, "database.db");
  const db = new sqlite3.Database(dbFile);

  db.serialize(() => {
    // Tabella users
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

    // Tabella file_uploads
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

    // Crea admin di default
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

  return db;
}

module.exports = {
  setupDatabase,
};
