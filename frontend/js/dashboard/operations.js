// =============================================
//  OPERAZIONI FILE: RINOMINA, COPIA, SPOSTA
// =============================================

function openRenameModal(oldPath, type) {
  const parts = oldPath.split("/");
  const currentName = parts[parts.length - 1];

  document.getElementById("renameOldPath").value = oldPath;
  document.getElementById("renameType").value = type;
  const input = document.getElementById("renameNewName");
  input.value = currentName;

  const modal = new bootstrap.Modal(document.getElementById("renameModal"));
  modal.show();

  document.getElementById("renameModal").addEventListener(
    "shown.bs.modal",
    () => { input.focus(); input.select(); },
    { once: true }
  );
}

async function confirmRename() {
  const oldPath = document.getElementById("renameOldPath").value;
  const newName = document.getElementById("renameNewName").value.trim();

  if (!newName) {
    showToast("Inserisci un nome valido", "warning");
    return;
  }
  if (newName.includes("/") || newName.includes("..")) {
    showToast("Il nome non può contenere / o ..", "error");
    return;
  }

  try {
    const response = await fetch("/api/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPath, newName }),
      credentials: "same-origin",
    });
    const data = await response.json();

    if (data.success) {
      bootstrap.Modal.getInstance(document.getElementById("renameModal")).hide();
      showToast(`Rinominato con successo in "${newName}"`, "success");
      loadFiles(window.currentPath);
    } else {
      showToast("Errore durante la rinomina: " + (data.message || "Errore sconosciuto"), "error");
    }
  } catch (err) {
    console.error("Errore rinomina:", err);
    showToast("Errore durante la rinomina", "error");
  }
}

// =============================================
//  COPIA
// =============================================

function openCopyModal(sourcePath) {
  document.getElementById("copyMoveSourcePath").value = sourcePath;
  document.getElementById("copyMoveAction").value = "copy";
  document.getElementById("copyMoveTitle").textContent = "Copia";
  document.getElementById("confirmCopyMoveText").textContent = "Copia";
  document.getElementById("copyMoveDestFolder").value = "";
  document.getElementById("copyMoveName").value = "";

  new bootstrap.Modal(document.getElementById("copyMoveModal")).show();
}

// =============================================
//  SPOSTA
// =============================================

function openMoveModal(sourcePath) {
  document.getElementById("copyMoveSourcePath").value = sourcePath;
  document.getElementById("copyMoveAction").value = "move";
  document.getElementById("copyMoveTitle").textContent = "Sposta";
  document.getElementById("confirmCopyMoveText").textContent = "Sposta";
  document.getElementById("copyMoveDestFolder").value = "";
  document.getElementById("copyMoveName").value = "";

  new bootstrap.Modal(document.getElementById("copyMoveModal")).show();
}

async function confirmCopyMove() {
  const sourcePath = document.getElementById("copyMoveSourcePath").value;
  const action = document.getElementById("copyMoveAction").value;
  const destFolder = document.getElementById("copyMoveDestFolder").value.trim();
  const newName = document.getElementById("copyMoveName").value.trim();

  if (!sourcePath) {
    showToast("Percorso sorgente non valido", "error");
    return;
  }

  try {
    const response = await fetch("/api/copy-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        sourcePath,
        destFolder: destFolder || "",
        newName: newName || pathBasename(sourcePath),
      }),
      credentials: "same-origin",
    });
    const data = await response.json();

    if (data.success) {
      bootstrap.Modal.getInstance(document.getElementById("copyMoveModal")).hide();
      showToast(`File/cartella ${action === "copy" ? "copiato" : "spostato"} con successo!`, "success");
      loadFiles(window.currentPath);
    } else {
      showToast("Errore: " + (data.message || "Operazione fallita"), "error");
    }
  } catch (err) {
    console.error("Errore copia/sposta:", err);
    showToast("Errore durante l'operazione", "error");
  }
}

// =============================================
//  DOWNLOAD ZIP
// =============================================

async function downloadItemAsZip(filePath, fileName) {
  const link = document.createElement("a");
  link.href = `/api/download-zip/${encodeURIComponent(filePath)}`;
  link.click();
  showToast(`Download di "${fileName}.zip" avviato`, "success");
}

async function downloadCurrentView() {
  try {
    const folderName = window.currentPath ? window.currentPath.split("/").pop() : "files";
    showToast(`Preparazione download "${folderName}.zip"...`, "info");

    const response = await fetch("/api/download-current-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: window.currentPath }),
      credentials: "same-origin",
    });

    if (!response.ok) throw new Error(`Errore HTTP ${response.status}`);

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${folderName}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    showToast(`Download di "${folderName}.zip" completato`, "success");
  } catch (err) {
    console.error("Errore download visualizzazione:", err);
    showToast("Errore durante il download della visualizzazione", "error");
  }
}

// =============================================
//  CREA CARTELLA
// =============================================

function createNewFolder() {
  const input = document.getElementById("newFolderName");
  const folderName = input.value.trim();

  if (!folderName) {
    showToast("Inserisci un nome per la cartella", "warning");
    return;
  }
  if (folderName.includes("..") || folderName.includes("/")) {
    showToast("Nome cartella non valido", "error");
    return;
  }

  const fullPath = window.currentPath ? `${window.currentPath}/${folderName}` : folderName;

  fetch("/api/create-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: fullPath }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        input.value = "";
        showToast(`Cartella "${folderName}" creata con successo!`, "success");
        loadFiles(window.currentPath);
      } else {
        showToast("Errore: " + (data.message || "Impossibile creare la cartella."), "error");
      }
    })
    .catch(() => showToast("Errore durante la creazione della cartella.", "error"));
}
