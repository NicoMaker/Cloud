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
    strengthElement.className = "password-strength";
  } else if (validCount < 3) {
    strengthElement.style.width = "33%";
    strengthElement.className = "password-strength strength-weak";
  } else if (validCount < 5) {
    strengthElement.style.width = "66%";
    strengthElement.className = "password-strength strength-medium";
  } else {
    strengthElement.style.width = "100%";
    strengthElement.className = "password-strength strength-strong";
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
      element.style.color = valid ? "#28a745" : "#6c757d";
      element.innerHTML = (valid ? "✓ " : "• ") + element.textContent.replace(/^[✓•] /, "");
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

        // Badge protezione: solo per ultimo admin, e solo spiega che il RUOLO non si può cambiare
        let protectionBadge = "";
        if (user.isProtected) {
          protectionBadge = `
            <span class="badge bg-warning text-dark ms-1"
                  title="Ultimo amministratore: non puoi cambiare il ruolo né eliminarlo, ma puoi modificare nome e password">
              <i class="fas fa-shield-alt"></i> Ultimo Admin
            </span>
          `;
        }

        // Il pulsante Modifica è SEMPRE abilitato per tutti
        // canChangeRole serve solo per gestire il select del ruolo nel modal
        row.innerHTML = `
          <td><strong>#${user.id}</strong></td>
          <td>
            <i class="fas fa-user me-2"></i>${user.username}
          </td>
          <td>
            <span class="badge ${user.role === "admin" ? "bg-danger" : "bg-primary"}">
              <i class="fas ${user.role === "admin" ? "fa-crown" : "fa-user"} me-1"></i>
              ${user.role.toUpperCase()}
            </span>
            ${protectionBadge}
          </td>
          <td><small class="text-muted">${createdDate}</small></td>
          <td><small class="text-muted">${lastLogin}</small></td>
          <td>
            <button class="btn btn-outline-primary btn-sm me-1"
                    onclick="editUser(${user.id}, '${user.username}', '${user.role}', ${!!user.canChangeRole})">
              <i class="fas fa-edit"></i> Modifica
            </button>
            ${user.canDelete
              ? `<button class="btn btn-outline-danger btn-sm"
                         onclick="deleteUser(${user.id}, '${user.username}')">
                   <i class="fas fa-trash"></i> Elimina
                 </button>`
              : `<span class="text-muted small" title="Non puoi eliminare l'ultimo amministratore">
                   <i class="fas fa-shield-alt me-1"></i>Protetto
                 </span>`
            }
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
  alertEl.className = `alert alert-${type} alert-dismissible fade show`;
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