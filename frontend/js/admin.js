// =============================================
//  PANNELLO ADMIN
// =============================================

// =============================================
//  TOGGLE MOSTRA/NASCONDI PASSWORD
// =============================================

function togglePassword(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon  = document.getElementById(iconId);
  if (!input || !icon) return;

  if (input.type === "password") {
    input.type = "text";
    icon.classList.replace("fa-eye", "fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.replace("fa-eye-slash", "fa-eye");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadUsers();
  checkUrlParams();
  setupPasswordValidation();
});

function setupPasswordValidation() {
  const passwordInput = document.getElementById("password");
  const editPasswordInput = document.getElementById("editPassword");

  if (passwordInput) {
    passwordInput.addEventListener("input", (e) =>
      validatePasswordStrength(e.target.value, "passwordStrength", "createUserBtn"),
    );
  }

  if (editPasswordInput) {
    editPasswordInput.addEventListener("input", (e) =>
      validatePasswordStrength(e.target.value, "editPasswordStrength"),
    );
  }
}

function validatePasswordStrength(password, strengthElementId, buttonId = null) {
  const strengthElement = document.getElementById(strengthElementId);
  const button = buttonId ? document.getElementById(buttonId) : null;

  const requirements = {
    length:  password.length >= 8,
    upper:   /[A-Z]/.test(password),
    lower:   /[a-z]/.test(password),
    number:  /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  if (strengthElementId === "passwordStrength") {
    updateRequirementIndicators(requirements);
  }

  const validCount = Object.values(requirements).filter(Boolean).length;

  if (password.length === 0) {
    strengthElement.style.width = "0%";
    strengthElement.className = "pw-strength-fill";
  } else if (validCount < 3) {
    strengthElement.className = "pw-strength-fill strength-weak";
  } else if (validCount < 5) {
    strengthElement.className = "pw-strength-fill strength-medium";
  } else {
    strengthElement.className = "pw-strength-fill strength-strong";
  }

  if (button) {
    button.disabled = !Object.values(requirements).every(Boolean) || password.length === 0;
  }
}

function updateRequirementIndicators(requirements) {
  const indicators = {
    "req-length":  requirements.length,
    "req-upper":   requirements.upper,
    "req-lower":   requirements.lower,
    "req-number":  requirements.number,
    "req-special": requirements.special,
  };

  Object.entries(indicators).forEach(([id, valid]) => {
    const element = document.getElementById(id);
    if (element) {
      element.classList.toggle("valid", valid);
    }
  });
}

function loadUsers() {
  fetch("/api/users")
    .then((res) => res.json())
    .then((data) => {
      const table = document.getElementById("userTable");
      table.innerHTML = "";

      const users = data.users || data;

      users.forEach((user) => {
        const row = document.createElement("tr");
        row.className = "fade-in";

        const createdDate = user.created_at
          ? new Date(user.created_at).toLocaleDateString("it-IT")
          : "N/A";
        const lastLogin = user.last_login
          ? new Date(user.last_login).toLocaleDateString("it-IT")
          : "Mai";

        // Badge protezione
        let protectionBadge = "";
        if (user.isProtected) {
          protectionBadge = `
            <span class="badge-protected"
                  title="Ultimo amministratore: puoi modificare nome e password, ma non il ruolo">
              <i class="fas fa-shield-alt"></i> Ultimo Admin
            </span>
          `;
        }

        row.innerHTML = `
          <td><strong style="color:var(--text-3);font-size:.82rem;">#${user.id}</strong></td>
          <td>
            <span style="display:flex;align-items:center;gap:.45rem;">
              <i class="fas fa-circle-user" style="color:var(--text-3)"></i>
              <strong style="font-weight:600">${user.username}</strong>
            </span>
          </td>
          <td>
            <span class="role-badge ${user.role === "admin" ? "role-admin" : "role-user"}">
              <i class="fas ${user.role === "admin" ? "fa-crown" : "fa-user"}"></i>
              ${user.role.toUpperCase()}
            </span>
            ${protectionBadge}
          </td>
          <td style="color:var(--text-3);font-size:.82rem;">${createdDate}</td>
          <td style="color:var(--text-3);font-size:.82rem;">${lastLogin}</td>
          <td>
            <div class="user-actions">
              <button class="admin-btn admin-btn-outline-primary admin-btn-sm"
                      onclick="editUser(${user.id}, '${user.username}', '${user.role}', ${!!user.canChangeRole})">
                <i class="fas fa-pen"></i> Modifica
              </button>
              ${user.canDelete
                ? `<button class="admin-btn admin-btn-outline-danger admin-btn-sm"
                           onclick="deleteUser(${user.id}, '${user.username}')">
                     <i class="fas fa-trash"></i> Elimina
                   </button>`
                : `<span style="color:var(--text-3);font-size:.78rem;display:flex;align-items:center;gap:.3rem;">
                     <i class="fas fa-shield-alt"></i> Protetto
                   </span>`
              }
            </div>
          </td>
        `;
        table.appendChild(row);
      });
    })
    .catch((err) => {
      console.error("Failed to load users:", err);
      showAlert("Errore nel caricamento utenti", "danger");
    });
}

function editUser(id, username, role, canChangeRole = true) {
  document.getElementById("editUserId").value = id;
  document.getElementById("editUsername").value = username;
  document.getElementById("editPassword").value = "";

  const roleSelect = document.getElementById("editRole");
  roleSelect.value = role;

  // Rimuovi avviso precedente se presente
  const modalBody = roleSelect.closest(".modal-body");
  const existingWarning = modalBody.querySelector(".admin-protection-warning");
  if (existingWarning) existingWarning.remove();

  if (!canChangeRole && role === "admin") {
    // Blocca SOLO il select del ruolo, non l'intero form
    roleSelect.disabled = true;
    roleSelect.title = "Non puoi cambiare il ruolo dell'ultimo amministratore";

    // Aggiungi un campo hidden con il valore del ruolo
    // così il form invia comunque il valore corretto anche con select disabilitato
    let hiddenRole = modalBody.querySelector("#hiddenRole");
    if (!hiddenRole) {
      hiddenRole = document.createElement("input");
      hiddenRole.type = "hidden";
      hiddenRole.name = "role";
      hiddenRole.id = "hiddenRole";
      modalBody.appendChild(hiddenRole);
    }
    hiddenRole.value = role;

    // Avviso informativo
    const warningDiv = document.createElement("div");
    warningDiv.className = "admin-protection-warning alert alert-warning mt-2";
    warningDiv.innerHTML = `
      <i class="fas fa-shield-alt me-2"></i>
      <strong>Ultimo Amministratore:</strong> Puoi modificare nome e password,
      ma non puoi cambiare il ruolo finché non esistono altri amministratori.
    `;
    modalBody.appendChild(warningDiv);
  } else {
    // Ruolo liberamente modificabile
    roleSelect.disabled = false;
    roleSelect.title = "";

    // Rimuovi hidden role se presente (non serve)
    const hiddenRole = modalBody.querySelector("#hiddenRole");
    if (hiddenRole) hiddenRole.remove();
  }

  const modal = window.bootstrap.Modal.getOrCreateInstance(
    document.getElementById("editUserModal"),
  );
  modal.show();
}

function deleteUser(id, username) {
  if (!confirm(`Sei sicuro di voler eliminare l'utente "${username}"?`)) return;

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/delete-user";
  form.innerHTML = `<input type="hidden" name="id" value="${id}">`;
  document.body.appendChild(form);
  form.submit();
}

function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const success = urlParams.get("success");
  const error = urlParams.get("error");
  const details = urlParams.get("details");

  if (success) {
    const messages = {
      user_created: "Utente creato con successo!",
      user_updated: "Utente aggiornato con successo!",
      user_deleted: "Utente eliminato con successo!",
    };
    showAlert(messages[success] || "Operazione completata con successo!", "success");
  }

  if (error) {
    const messages = {
      missing_fields:           "Compila tutti i campi richiesti.",
      user_exists:              "Nome utente già esistente.",
      update_failed:            "Errore nell'aggiornamento utente.",
      delete_failed:            "Errore nell'eliminazione utente.",
      cannot_delete_last_admin: "Non puoi eliminare l'ultimo amministratore.",
      cannot_change_last_admin: "Non puoi cambiare il ruolo dell'ultimo amministratore.",
      user_not_found:           "Utente non trovato.",
      invalid_user_id:          "ID utente non valido.",
      weak_password:            "Password troppo debole. " + (details ? decodeURIComponent(details) : "Controlla i requisiti."),
      database_error:           "Errore del database. Riprova più tardi.",
    };

    showAlert(messages[error] || "Si è verificato un errore.", "danger");
  }
}

function showAlert(message, type) {
  const alertContainer = document.getElementById("alertContainer");
  const alertId = "alert-" + Date.now();

  const alertEl = document.createElement("div");
  alertEl.id = alertId;
  alertEl.className = `alert alert-${type} alert-dismissible fade show fade-in`;
  alertEl.innerHTML = `
    <i class="fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-triangle"} me-2"></i>
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;

  alertContainer.appendChild(alertEl);

  setTimeout(() => {
    if (document.getElementById(alertId)) {
      window.bootstrap.Alert.getOrCreateInstance(alertEl).close();
    }
  }, 5000);
}