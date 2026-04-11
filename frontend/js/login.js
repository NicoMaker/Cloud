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