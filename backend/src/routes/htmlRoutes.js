// =============================================
//  ROUTE PAGINE HTML
// =============================================

const path = require("path");

function setupHtmlRoutes(app, requireLogin, frontendDir) {
  // Root: dashboard se loggato, altrimenti login
  app.get("/", (req, res) => {
    if (req.session && req.session.userId) {
      res.sendFile(path.join(frontendDir, "dashboard.html"));
    } else {
      res.sendFile(path.join(frontendDir, "login.html"));
    }
  });

  app.get("/login.html", (req, res) => {
    res.sendFile(path.join(frontendDir, "login.html"));
  });

  app.get("/dashboard.html", requireLogin, (req, res) => {
    res.sendFile(path.join(frontendDir, "dashboard.html"));
  });
}

module.exports = { setupHtmlRoutes };
