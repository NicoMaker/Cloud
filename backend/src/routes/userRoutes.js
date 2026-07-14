// =============================================
//  ROUTE USER MANAGEMENT
//  Mappa gli esiti del service ai redirect verso /admin.html.
// =============================================

const { creaUtentiService } = require("../services/utentiService");

// Costruisce l'URL di redirect da una chiave d'errore/successo
function redirectUrl(base, key, details) {
  let url = `${base}?error=${key}`;
  const messaggiConDettaglio = {
    cannot_change_last_admin:
      "Non puoi cambiare il ruolo dell'ultimo amministratore",
    cannot_delete_last_admin: "Non puoi eliminare l'ultimo amministratore",
  };
  if (details) url += `&details=${encodeURIComponent(details)}`;
  else if (messaggiConDettaglio[key])
    url += `&details=${encodeURIComponent(messaggiConDettaglio[key])}`;
  return url;
}

function setupUserRoutes(app, db, forceLogoutUserEverywhere, requireAdmin) {
  const utenti = creaUtentiService(db);

  // GET lista utenti
  app.get("/api/users", requireAdmin, (req, res) => {
    utenti.lista((err, data) => {
      if (err) return res.status(err.status).json({ error: err.error });
      res.json(data);
    });
  });

  // POST crea utente
  app.post("/create-user", requireAdmin, (req, res) => {
    utenti.crea(req.body, (errorKey, details) => {
      if (errorKey) return res.redirect(redirectUrl("/admin.html", errorKey, details));
      res.redirect("/admin.html?success=user_created");
    });
  });

  // POST aggiorna utente
  app.post("/update-user", requireAdmin, (req, res) => {
    utenti.aggiorna(
      { ...req.body, requestingAdminId: req.session.user.id },
      (errorKey, details, meta) => {
        if (errorKey) return res.redirect(redirectUrl("/admin.html", errorKey, details));

        if (meta.isSelf) {
          // Ha modificato sé stesso → deve riautenticarsi
          return req.session.destroy(() => {
            res.redirect("/login.html?error=credentials_changed");
          });
        }
        // Ha modificato un altro utente → logout forzato per quello
        forceLogoutUserEverywhere(meta.targetId, "account_updated", () => {
          res.redirect("/admin.html?success=user_updated");
        });
      },
    );
  });

  // POST elimina utente
  app.post("/delete-user", requireAdmin, (req, res) => {
    utenti.elimina(req.body.id, (errorKey, details, meta) => {
      if (errorKey) return res.redirect(redirectUrl("/admin.html", errorKey, details));
      forceLogoutUserEverywhere(meta.targetId, "account_deleted", () => {
        res.redirect("/admin.html?success=user_deleted");
      });
    });
  });
}

module.exports = { setupUserRoutes };
