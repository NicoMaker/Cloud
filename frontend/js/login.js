// =============================================
//  LOGIN - MESSAGGI ERRORE & VALIDAZIONE PASSWORD
// =============================================

// Check for error parameter
const urlParams = new URLSearchParams(window.location.search);
const error = urlParams.get("error");

if (error) {
  const errorAlert = document.getElementById("errorAlert");
  const errorMessage = document.getElementById("errorMessage");

  const messages = {
    missing_fields:      "Compila tutti i campi richiesti",
    invalid_credentials: "Nome utente o password non corretti",
    database_error:      "Errore del database. Riprova più tardi.",
    weak_password:       "Password troppo debole. " + (urlParams.get("details") || ""),
    session_expired:     "Sessione scaduta. Effettua nuovamente il login.",
    auth_error:          "Errore di autenticazione. Riprova.",
    credentials_changed: "Le tue credenziali sono state modificate. Accedi nuovamente.",
    account_changed:     "Il tuo account è stato modificato. Accedi nuovamente.",
  };

  errorMessage.textContent = messages[error] || "Errore di accesso";
  errorAlert.classList.remove("d-none");
}

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

// =============================================
//  VALIDAZIONE PASSWORD IN TEMPO REALE
// =============================================

document.addEventListener("DOMContentLoaded", () => {
  const passwordInput = document.getElementById("password");
  if (passwordInput) {
    passwordInput.addEventListener("input", (e) => {
      validateLoginPassword(e.target.value);
    });
  }
});

function validateLoginPassword(password) {
  const requirements = {
    length:  password.length >= 8,
    upper:   /[A-Z]/.test(password),
    lower:   /[a-z]/.test(password),
    number:  /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  // Aggiorna indicatori requisiti
  const indicators = {
    "req-length":  requirements.length,
    "req-upper":   requirements.upper,
    "req-lower":   requirements.lower,
    "req-number":  requirements.number,
    "req-special": requirements.special,
  };

  Object.entries(indicators).forEach(([id, valid]) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.color = valid ? "#28a745" : "#6c757d";
      el.innerHTML = (valid ? "✓ " : "• ") + el.textContent.replace(/^[✓•] /, "");
    }
  });

  // Aggiorna barra forza password
  const strengthEl = document.getElementById("loginPasswordStrength");
  if (!strengthEl) return;

  const validCount = Object.values(requirements).filter(Boolean).length;

  if (password.length === 0) {
    strengthEl.style.width = "0%";
    strengthEl.className = "password-strength";
  } else if (validCount < 3) {
    strengthEl.style.width = "33%";
    strengthEl.className = "password-strength strength-weak";
  } else if (validCount < 5) {
    strengthEl.style.width = "66%";
    strengthEl.className = "password-strength strength-medium";
  } else {
    strengthEl.style.width = "100%";
    strengthEl.className = "password-strength strength-strong";
  }
}