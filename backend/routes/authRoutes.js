// =============================================
//  ROUTE AUTH (LOGIN/LOGOUT/SESSIONE)
// =============================================

const express = require("express");
const { verifyPassword } = require("../services/passwordUtils");

function setupAuthRoutes(app, db, requireLogin) {
  // Login
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

  // Logout
  app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
      res.redirect("/login.html");
    });
  });

  // Session Info
  app.get("/session-info", (req, res) => {
    const id = req.session?.user?.id || null;
    const role = req.session?.user?.role || "guest";
    const username = req.session?.user?.username || "guest";
    res.json({ id, role, username });
  });

  // Session Check
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

  // Home redirect
  app.get("/", (req, res) => res.redirect("/login.html"));
}

module.exports = {
  setupAuthRoutes,
};