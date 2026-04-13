// =============================================
//  MIDDLEWARE AUTENTICAZIONE
// =============================================

const session = require("express-session");
const crypto = require("crypto");

function createSessionMiddleware() {
  return session({
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
}

function debugSessionMiddleware() {
  return (req, res, next) => {
    if (req.path === "/upload" || req.path.startsWith("/api/")) {
      console.log(`🔍 ${req.method} ${req.path} - Session:`, {
        hasSession: !!req.session,
        hasUser: !!req.session?.user,
        userId: req.session?.user?.id,
        userRole: req.session?.user?.role,
      });
    }
    next();
  };
}

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

module.exports = {
  createSessionMiddleware,
  debugSessionMiddleware,
  requireLogin,
  requireAdmin,
};