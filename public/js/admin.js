// Initialize admin panel
document.addEventListener("DOMContentLoaded", () => {
    loadUsers()
    checkUrlParams()
    setupPasswordValidation()
})

function setupPasswordValidation() {
    const passwordInput = document.getElementById("password")
    const editPasswordInput = document.getElementById("editPassword")

    if (passwordInput) {
        passwordInput.addEventListener("input", (e) =>
            validatePassword(e.target.value, "passwordStrength", "createUserBtn"),
        )
    }

    if (editPasswordInput) {
        editPasswordInput.addEventListener("input", (e) => validatePassword(e.target.value, "editPasswordStrength"))
    }
}

function validatePassword(password, strengthElementId, buttonId = null) {
    const strengthElement = document.getElementById(strengthElementId)
    const button = buttonId ? document.getElementById(buttonId) : null

    const requirements = {
        length: password.length >= 8,
        upper: /[A-Z]/.test(password),
        lower: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    }

    // Update requirement indicators
    if (strengthElementId === "passwordStrength") {
        updateRequirementIndicators(requirements)
    }

    const validCount = Object.values(requirements).filter(Boolean).length

    // Update strength bar
    if (password.length === 0) {
        strengthElement.style.width = "0%"
        strengthElement.className = "password-strength"
    } else if (validCount < 3) {
        strengthElement.style.width = "33%"
        strengthElement.className = "password-strength strength-weak"
    } else if (validCount < 5) {
        strengthElement.style.width = "66%"
        strengthElement.className = "password-strength strength-medium"
    } else {
        strengthElement.style.width = "100%"
        strengthElement.className = "password-strength strength-strong"
    }

    // Enable/disable button
    if (button) {
        const allValid = Object.values(requirements).every(Boolean)
        button.disabled = !allValid || password.length === 0
    }
}

function updateRequirementIndicators(requirements) {
    const indicators = {
        "req-length": requirements.length,
        "req-upper": requirements.upper,
        "req-lower": requirements.lower,
        "req-number": requirements.number,
        "req-special": requirements.special,
    }

    Object.entries(indicators).forEach(([id, valid]) => {
        const element = document.getElementById(id)
        if (element) {
            element.style.color = valid ? "#28a745" : "#6c757d"
            element.innerHTML = (valid ? "✓ " : "• ") + element.textContent.replace(/^[✓•] /, "")
        }
    })
}

function loadUsers() {
    fetch("/api/users")
        .then((res) => res.json())
        .then((users) => {
            const table = document.getElementById("userTable")
            table.innerHTML = ""

            users.forEach((user) => {
                const row = document.createElement("tr")
                row.className = "fade-in"

                const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString("it-IT") : "N/A"
                const lastLogin = user.last_login ? new Date(user.last_login).toLocaleDateString("it-IT") : "Mai"

                row.innerHTML = `
          <td><strong>#${user.id}</strong></td>
          <td>
              <i class="fas fa-user me-2"></i>
              ${user.username}
          </td>
          <td>
              <span class="badge ${user.role === "admin" ? "bg-danger" : "bg-primary"}">
                  <i class="fas ${user.role === "admin" ? "fa-crown" : "fa-user"} me-1"></i>
                  ${user.role.toUpperCase()}
              </span>
          </td>
          <td><small class="text-muted">${createdDate}</small></td>
          <td><small class="text-muted">${lastLogin}</small></td>
          <td>
              <button class="btn btn-outline-primary btn-sm me-1" onclick="editUser(${user.id}, '${user.username}', '${user.role}')">
                  <i class="fas fa-edit"></i> Modifica
              </button>
              ${user.id !== 1
                        ? `
                  <button class="btn btn-outline-danger btn-sm" onclick="deleteUser(${user.id}, '${user.username}')">
                      <i class="fas fa-trash"></i> Elimina
                  </button>
              `
                        : `
                  <span class="text-muted small">
                      <i class="fas fa-shield-alt me-1"></i>Protetto
                  </span>
              `
                    }
          </td>
        `
                table.appendChild(row)
            })
        })
        .catch((err) => {
            console.error("Failed to load users:", err)
            showAlert("Errore nel caricamento utenti", "danger")
        })
}

function editUser(id, username, role) {
    document.getElementById("editUserId").value = id
    document.getElementById("editUsername").value = username
    document.getElementById("editPassword").value = ""
    document.getElementById("editRole").value = role

    const modal = window.bootstrap.Modal.getOrCreateInstance(document.getElementById("editUserModal"))
    modal.show()
}

function deleteUser(id, username) {
    if (!confirm(`Sei sicuro di voler eliminare l'utente "${username}"?`)) return

    const form = document.createElement("form")
    form.method = "POST"
    form.action = "/delete-user"
    form.innerHTML = `<input type="hidden" name="id" value="${id}">`
    document.body.appendChild(form)
    form.submit()
}

function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search)
    const success = urlParams.get("success")
    const error = urlParams.get("error")
    const details = urlParams.get("details")

    if (success) {
        const messages = {
            user_created: "Utente creato con successo!",
            user_updated: "Utente aggiornato con successo!",
            user_deleted: "Utente eliminato con successo!",
        }
        showAlert(messages[success] || "Operazione completata con successo!", "success")
    }

    if (error) {
        const messages = {
            missing_fields: "Compila tutti i campi richiesti.",
            user_exists: "Nome utente già esistente.",
            update_failed: "Errore nell'aggiornamento utente.",
            delete_failed: "Errore nell'eliminazione utente.",
            cannot_delete_admin: "Impossibile eliminare l'utente admin principale.",
            weak_password: "Password troppo debole. " + (details || "Controlla i requisiti."),
            database_error: "Errore del database. Riprova più tardi.",
        }
        showAlert(messages[error] || "Si è verificato un errore.", "danger")
    }
}

function showAlert(message, type) {
    const alertContainer = document.getElementById("alertContainer")
    const alertId = "alert-" + Date.now()

    const alertEl = document.createElement("div")
    alertEl.id = alertId
    alertEl.className = `alert alert-${type} alert-dismissible fade show`
    alertEl.innerHTML = `
    <i class="fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-triangle"} me-2"></i>
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `

    alertContainer.appendChild(alertEl)

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (document.getElementById(alertId)) {
            const alert = window.bootstrap.Alert.getOrCreateInstance(alertEl)
            alert.close()
        }
    }, 5000)
}

// Add fade-in animation
const style = document.createElement("style")
style.textContent = `
  .fade-in {
      animation: fadeIn 0.3s ease;
  }
  
  @keyframes fadeIn {
      from {
          opacity: 0;
          transform: translateY(10px);
      }
      to {
          opacity: 1;
          transform: translateY(0);
      }
  }
`
document.head.appendChild(style)
