// =============================================
//  CONTROLLER OPERAZIONI FILE
//  Traduce HTTP ⇄ fileOpsService. Nessuna logica di business qui.
// =============================================

function creaFileOpsController(fileOps) {
  // Gestione uniforme degli errori del service
  const handle = (res, fn) => {
    try {
      const result = fn();
      res.json(result);
    } catch (err) {
      if (err instanceof fileOps.FileOpError) {
        return res.status(err.status).json({
          success: false,
          message: err.message,
          ...err.extra,
        });
      }
      console.error("❌ Errore operazione file:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  };

  return {
    rename(req, res) {
      handle(res, () => fileOps.rename(req.body));
    },

    copyMove(req, res) {
      handle(res, () => fileOps.copyMove(req.body));
    },

    // Delete richiede admin (verificato qui perché dipende dalla sessione)
    deletePath(req, res) {
      if (req.session.user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      handle(res, () => fileOps.deletePath(req.params[0]));
    },

    async deleteAll(req, res) {
      try {
        res.json(await fileOps.deleteAll());
      } catch (err) {
        res.status(err.status || 500).json({
          error: err.extra?.error || "Delete all failed",
          message: err.message,
        });
      }
    },

    createFolder(req, res) {
      try {
        res.json(fileOps.createFolder(req.body?.path));
      } catch (err) {
        if (err instanceof fileOps.FileOpError) {
          return res.status(err.status).json({ success: false, message: err.message });
        }
        console.error("Errore creazione cartella:", err);
        res.status(500).json({ success: false, message: "Errore interno" });
      }
    },
  };
}

module.exports = { creaFileOpsController };
