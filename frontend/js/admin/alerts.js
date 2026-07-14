// =============================================
//  ADMIN: ALERT E MESSAGGI URL
// =============================================

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
    showAlert(
      messages[success] || "Operazione completata con successo!",
      "success",
    );
  }

  if (error) {
    const messages = {
      missing_fields: "Compila tutti i campi richiesti.",
      user_exists: "Nome utente già esistente.",
      update_failed: "Errore nell'aggiornamento utente.",
      delete_failed: "Errore nell'eliminazione utente.",
      cannot_delete_last_admin: "Non puoi eliminare l'ultimo amministratore.",
      cannot_change_last_admin:
        "Non puoi cambiare il ruolo dell'ultimo amministratore.",
      user_not_found: "Utente non trovato.",
      invalid_user_id: "ID utente non valido.",
      weak_password:
        "Password troppo debole. " +
        (details ? decodeURIComponent(details) : "Controlla i requisiti."),
      database_error: "Errore del database. Riprova più tardi.",
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

window.checkUrlParams = checkUrlParams;
window.showAlert = showAlert;
