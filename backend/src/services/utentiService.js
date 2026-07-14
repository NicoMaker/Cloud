// =============================================
//  SERVICE UTENTI
//  Logica di business per la gestione utenti (crea/aggiorna/elimina/lista).
//  Callback-based per restare coerente con sqlite3 e i controlli admin.
// =============================================

const { hashPassword, validatePassword } = require("../utils/passwordUtils");
const {
  countAdmins,
  canDeleteAdmin,
  canChangeAdminToUser,
} = require("./adminUtils");

function creaUtentiService(db) {
  return {
    // Lista utenti con permessi calcolati
    lista(callback) {
      db.all(
        "SELECT id, username, role, created_at, last_login FROM users ORDER BY role DESC, username",
        (err, rows) => {
          if (err) return callback({ status: 500, error: "Database error" });
          countAdmins(db, (countErr, adminCount) => {
            if (countErr)
              return callback({ status: 500, error: "Error counting admins" });
            const users = rows.map((user) => ({
              ...user,
              canDelete: user.role !== "admin" || adminCount.count > 1,
              canChangeRole: user.role !== "admin" || adminCount.count > 1,
              isProtected: user.role === "admin" && adminCount.count === 1,
            }));
            callback(null, {
              users,
              adminCount: adminCount.count,
              totalUsers: rows.length,
            });
          });
        },
      );
    },

    // Crea un utente. onResult riceve una chiave di esito da mappare a redirect.
    crea({ username, password, role }, onResult) {
      if (!username || !password || !role) return onResult("missing_fields");

      const passwordErrors = validatePassword(password);
      if (passwordErrors.length > 0) {
        return onResult("weak_password", passwordErrors.join(", "));
      }

      db.run(
        "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
        [username, hashPassword(password), role],
        (err) => {
          if (err) {
            if (err.code === "SQLITE_CONSTRAINT_UNIQUE") return onResult("user_exists");
            console.error("Database error:", err);
            return onResult("database_error");
          }
          console.log(`✅ Utente creato: ${username} (${role})`);
          onResult(null);
        },
      );
    },

    // Aggiorna un utente con i vincoli sull'ultimo admin.
    // onResult(errorKey, details, meta) — meta indica azioni post-update.
    aggiorna({ id, username, password, role, requestingAdminId }, onResult) {
      const targetId = Number.parseInt(id);

      if (!id || !username || !role) return onResult("missing_fields");
      if (password) {
        const passwordErrors = validatePassword(password);
        if (passwordErrors.length > 0) {
          return onResult("weak_password", passwordErrors.join(", "));
        }
      }

      db.get("SELECT role FROM users WHERE id = ?", [targetId], (err, user) => {
        if (err) {
          console.error("Database error:", err);
          return onResult("database_error");
        }
        if (!user) return onResult("user_not_found");

        const esegui = () => {
          let query, params;
          if (password) {
            query = "UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?";
            params = [username, hashPassword(password), role, targetId];
          } else {
            query = "UPDATE users SET username = ?, role = ? WHERE id = ?";
            params = [username, role, targetId];
          }
          db.run(query, params, (updateErr) => {
            if (updateErr) {
              console.error("Database error:", updateErr);
              return onResult("update_failed");
            }
            console.log(`✅ Utente aggiornato: ${username} (${role})`);
            onResult(null, null, {
              isSelf: targetId === requestingAdminId,
              targetId,
            });
          });
        };

        // Blocca solo il declassamento dell'ultimo admin
        if (user.role === "admin" && role === "user") {
          canChangeAdminToUser(db, targetId, (canErr, canChange) => {
            if (canErr) {
              console.error("Error checking admin change permission:", canErr);
              return onResult("database_error");
            }
            if (!canChange) return onResult("cannot_change_last_admin");
            esegui();
          });
        } else {
          esegui();
        }
      });
    },

    // Elimina un utente con vincolo sull'ultimo admin
    elimina(id, onResult) {
      const targetId = Number.parseInt(id);
      if (!targetId) return onResult("invalid_user_id");

      db.get("SELECT role FROM users WHERE id = ?", [targetId], (err, user) => {
        if (err) {
          console.error("Database error:", err);
          return onResult("database_error");
        }
        if (!user) return onResult("user_not_found");

        const esegui = () => {
          db.run("DELETE FROM users WHERE id = ?", [targetId], (deleteErr) => {
            if (deleteErr) {
              console.error("Database error:", deleteErr);
              return onResult("delete_failed");
            }
            console.log(`✅ Utente eliminato: ID ${targetId}`);
            onResult(null, null, { targetId });
          });
        };

        if (user.role === "admin") {
          canDeleteAdmin(db, targetId, (canErr, canDelete) => {
            if (canErr) {
              console.error("Error checking admin delete permission:", canErr);
              return onResult("database_error");
            }
            if (!canDelete) return onResult("cannot_delete_last_admin");
            esegui();
          });
        } else {
          esegui();
        }
      });
    },
  };
}

module.exports = { creaUtentiService };
