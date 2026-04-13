// =============================================
//  ROUTE USER MANAGEMENT
// =============================================

const { hashPassword, validatePassword } = require("../services/passwordUtils");
const { countAdmins, canDeleteAdmin, canChangeAdminToUser } = require("../services/adminUtils");

function setupUserRoutes(app, db, forceLogoutUserEverywhere, requireAdmin) {
  // GET lista utenti
  app.get("/api/users", requireAdmin, (req, res) => {
    db.all(
      "SELECT id, username, role, created_at, last_login FROM users ORDER BY role DESC, username",
      (err, rows) => {
        if (err) {
          res.status(500).json({ error: "Database error" });
        } else {
          countAdmins(db, (countErr, adminCount) => {
            if (countErr) {
              return res.status(500).json({ error: "Error counting admins" });
            }

            const usersWithPermissions = rows.map((user) => ({
              ...user,
              canDelete: user.role !== "admin" || adminCount.count > 1,
              canChangeRole: user.role !== "admin" || adminCount.count > 1,
              // L'utente è protetto solo da eliminazione/cambio ruolo,
              // NON dalla modifica di nome/password
              isProtected: user.role === "admin" && adminCount.count === 1,
            }));

            res.json({
              users: usersWithPermissions,
              adminCount: adminCount.count,
              totalUsers: rows.length,
            });
          });
        }
      },
    );
  });

  // POST crea utente
  app.post("/create-user", requireAdmin, (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.redirect("/admin.html?error=missing_fields");
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.redirect(
        `/admin.html?error=weak_password&details=${encodeURIComponent(passwordErrors.join(", "))}`,
      );
    }

    const hashedPassword = hashPassword(password);

    db.run(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      [username, hashedPassword, role],
      (err) => {
        if (err) {
          if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
            res.redirect("/admin.html?error=user_exists");
          } else {
            console.error("Database error:", err);
            res.redirect("/admin.html?error=database_error");
          }
        } else {
          console.log(`✅ Utente creato: ${username} (${role})`);
          res.redirect("/admin.html?success=user_created");
        }
      },
    );
  });

  // POST aggiorna utente
  app.post("/update-user", requireAdmin, (req, res) => {
    const { id, username, password, role } = req.body;
    const targetId = Number.parseInt(id);
    const requestingAdminId = req.session.user.id;

    if (!id || !username || !role) {
      return res.redirect("/admin.html?error=missing_fields");
    }

    if (password) {
      const passwordErrors = validatePassword(password);
      if (passwordErrors.length > 0) {
        return res.redirect(
          `/admin.html?error=weak_password&details=${encodeURIComponent(passwordErrors.join(", "))}`,
        );
      }
    }

    db.get("SELECT role FROM users WHERE id = ?", [targetId], (err, user) => {
      if (err) {
        console.error("Database error:", err);
        return res.redirect("/admin.html?error=database_error");
      }

      if (!user) {
        return res.redirect("/admin.html?error=user_not_found");
      }

      // Blocca SOLO il cambio di ruolo da admin a user se è l'ultimo admin
      if (user.role === "admin" && role === "user") {
        canChangeAdminToUser(db, targetId, (canChangeErr, canChange) => {
          if (canChangeErr) {
            console.error("Error checking admin change permission:", canChangeErr);
            return res.redirect("/admin.html?error=database_error");
          }

          if (!canChange) {
            return res.redirect(
              "/admin.html?error=cannot_change_last_admin&details=Non puoi cambiare il ruolo dell'ultimo amministratore",
            );
          }

          updateUserInDatabase();
        });
      } else {
        // Modifica nome/password SEMPRE permessa, anche per l'ultimo admin
        updateUserInDatabase();
      }

      function updateUserInDatabase() {
        let query, params;
        if (password) {
          const hashedPassword = hashPassword(password);
          query = "UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?";
          params = [username, hashedPassword, role, targetId];
        } else {
          query = "UPDATE users SET username = ?, role = ? WHERE id = ?";
          params = [username, role, targetId];
        }

        db.run(query, params, (updateErr) => {
          if (updateErr) {
            console.error("Database error:", updateErr);
            res.redirect("/admin.html?error=update_failed");
          } else {
            console.log(`✅ Utente aggiornato: ${username} (${role})`);

            if (targetId === requestingAdminId) {
              // Sta modificando sé stesso → distruggi la sessione e manda al login
              // Le credenziali sono cambiate, deve riautenticarsi
              req.session.destroy(() => {
                res.redirect("/login.html?error=credentials_changed");
              });
            } else {
              // Sta modificando un altro utente → logout forzato per lui
              forceLogoutUserEverywhere(targetId, "account_updated", () => {
                res.redirect("/admin.html?success=user_updated");
              });
            }
          }
        });
      }
    });
  });

  // POST elimina utente
  app.post("/delete-user", requireAdmin, (req, res) => {
    const id = Number.parseInt(req.body.id);

    if (!id) {
      return res.redirect("/admin.html?error=invalid_user_id");
    }

    db.get("SELECT role FROM users WHERE id = ?", [id], (err, user) => {
      if (err) {
        console.error("Database error:", err);
        return res.redirect("/admin.html?error=database_error");
      }

      if (!user) {
        return res.redirect("/admin.html?error=user_not_found");
      }

      if (user.role === "admin") {
        canDeleteAdmin(db, id, (canDeleteErr, canDelete) => {
          if (canDeleteErr) {
            console.error("Error checking admin delete permission:", canDeleteErr);
            return res.redirect("/admin.html?error=database_error");
          }

          if (!canDelete) {
            return res.redirect(
              "/admin.html?error=cannot_delete_last_admin&details=Non puoi eliminare l'ultimo amministratore",
            );
          }

          deleteUserFromDatabase();
        });
      } else {
        deleteUserFromDatabase();
      }

      function deleteUserFromDatabase() {
        db.run("DELETE FROM users WHERE id = ?", [id], (deleteErr) => {
          if (deleteErr) {
            console.error("Database error:", deleteErr);
            res.redirect("/admin.html?error=delete_failed");
          } else {
            console.log(`✅ Utente eliminato: ID ${id}`);
            forceLogoutUserEverywhere(id, "account_deleted", () => {
              res.redirect("/admin.html?success=user_deleted");
            });
          }
        });
      }
    });
  });
}

module.exports = {
  setupUserRoutes,
};