// =============================================
//  SESSIONE & INIZIALIZZAZIONE
// =============================================

document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
  setupEventListeners();
  setupSocketConnection();
});

async function checkSession() {
  try {
    const response = await fetch("/api/session-check");
    const data = await response.json();

    if (!data.valid) {
      showToast("Sessione scaduta. Reindirizzamento al login...", "warning");
      setTimeout(() => {
        window.location.replace("/login.html?error=session_expired");
      }, 2000);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Errore controllo sessione:", error);
    return false;
  }
}

function initializeApp() {
  fetch("/session-info")
    .then((res) => {
      if (res.status === 401) {
        window.location.replace("/login.html?error=session_expired");
        return;
      }
      return res.json();
    })
    .then((data) => {
      if (!data) return;

      window.currentUserId = data.id;
      window.userRole = data.role;
      document.getElementById("userInfo").innerHTML =
        `<i class="fas fa-user me-1"></i>${data.username} (${data.role})`;

      if (window.socket && window.currentUserId) {
        window.socket.emit("registerUserSession", { userId: window.currentUserId });
      }

      if (data.role === "admin") {
        document.getElementById("adminBtn").style.display = "inline-block";
        document.getElementById("deleteAllBtn").style.display = "inline-block";
      }
    })
    .catch((err) => {
      console.error("Errore nel caricamento info sessione:", err);
      showToast("Errore di autenticazione. Reindirizzamento al login...", "error");
      setTimeout(() => {
        window.location.replace("/login.html?error=auth_error");
      }, 2000);
    });

  loadFiles("");

  // Controllo sessione ogni 5 minuti
  setInterval(async () => {
    await checkSession();
  }, 5 * 60 * 1000);
}

function setupSocketConnection() {
  window.socket = io();

  window.socket.on("connect", () => {
    console.log("Connesso al server per aggiornamenti in tempo reale");
    if (window.currentUserId) {
      window.socket.emit("registerUserSession", { userId: window.currentUserId });
    }
  });

  window.socket.on("filesChanged", () => {
    loadFiles(window.currentPath);
  });

  window.socket.on("forceLogout", (payload) => {
    const reason = payload?.reason || "account_changed";
    let message = "La tua sessione è stata chiusa.";
    if (reason === "account_deleted") {
      message = "Il tuo utente è stato eliminato. Verrai reindirizzato al login.";
    } else if (reason === "account_updated") {
      message = "Il tuo account è stato modificato. Esegui di nuovo l'accesso.";
    }

    // Blocca subito qualsiasi reconnect del socket
    window.socket.off();
    window.socket.disconnect();

    // location.replace invece di href: non torna indietro col tasto back
    showToast(message, "warning");
    setTimeout(() => {
      window.location.replace("/login.html?error=account_changed");
    }, 1200);
  });
}

function setupEventListeners() {
  const fileInput = document.getElementById("fileInput");
  const folderInput = document.getElementById("folderInput");
  const confirmText = document.getElementById("confirmText");

  fileInput.addEventListener("change", handleFileSelection);
  folderInput.addEventListener("change", handleFolderSelection);

  if (confirmText) {
    confirmText.addEventListener("input", (e) => {
      const confirmBtn = document.getElementById("confirmDeleteAll");
      confirmBtn.disabled = e.target.value !== "ELIMINA TUTTO";
    });
  }

  const renameInput = document.getElementById("renameNewName");
  if (renameInput) {
    renameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmRename();
    });
  }
}