// Variabili globali
let currentPath = "";
let selectedFiles = [];
let socket;
let userRole = "user";
let currentUserId = null;
let isUploading = false;
const io = window.io;
const bootstrap = window.bootstrap;
let mainFolderNames = [];

// Inizializza l'applicazione
document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
  setupEventListeners();
  setupSocketConnection();
});

// Funzione per verificare sessione
async function checkSession() {
  try {
    const response = await fetch("/api/session-check");
    const data = await response.json();

    if (!data.valid) {
      console.log("❌ Sessione non valida, reindirizzamento al login");
      showToast("Sessione scaduta. Reindirizzamento al login...", "warning");
      setTimeout(() => {
        window.location.href = "/login.html?error=session_expired";
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
        window.location.href = "/login.html?error=session_expired";
        return;
      }
      return res.json();
    })
    .then((data) => {
      if (!data) return;

      currentUserId = data.id;
      userRole = data.role;
      document.getElementById("userInfo").innerHTML =
        `<i class="fas fa-user me-1"></i>${data.username} (${data.role})`;

      if (socket && currentUserId) {
        socket.emit("registerUserSession", { userId: currentUserId });
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
        window.location.href = "/login.html?error=auth_error";
      }, 2000);
    });

  loadFiles("");

  setInterval(
    async () => {
      const valid = await checkSession();
      if (!valid) {
        console.log("⏰ Controllo periodico: sessione scaduta");
      }
    },
    5 * 60 * 1000,
  );
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

  // Premere Invio nella modale rinomina
  const renameInput = document.getElementById("renameNewName");
  if (renameInput) {
    renameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmRename();
    });
  }
}

function setupSocketConnection() {
  socket = io();

  socket.on("uploadProgress", (data) => {
    updateUploadProgress(data);
  });

  socket.on("connect", () => {
    console.log("Connesso al server per aggiornamenti in tempo reale");
    if (currentUserId) {
      socket.emit("registerUserSession", { userId: currentUserId });
    }
  });

  socket.on("filesChanged", () => {
    loadFiles(currentPath);
    fetchAndShowSidebarTree(currentPath);
    showMainTree(currentPath);
  });

  socket.on("forceLogout", (payload) => {
    const reason = payload?.reason || "account_changed";
    let message = "La tua sessione e' stata chiusa.";
    if (reason === "account_deleted") {
      message = "Il tuo utente e' stato eliminato. Verrai reindirizzato al login.";
    } else if (reason === "account_updated") {
      message = "Il tuo account e' stato modificato. Esegui di nuovo l'accesso.";
    }
    showToast(message, "warning");
    setTimeout(() => {
      window.location.href = "/login.html?error=account_changed";
    }, 1200);
  });
}

// =============================================
//  FUNZIONE RINOMINA
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

  // Focus e selezione testo dopo apertura modale
  document.getElementById("renameModal").addEventListener(
    "shown.bs.modal",
    () => {
      input.focus();
      input.select();
    },
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
      // Chiudi la modale
      const modalEl = document.getElementById("renameModal");
      const modal = bootstrap.Modal.getInstance(modalEl);
      modal.hide();

      showToast(`Rinominato con successo in "${newName}"`, "success");
      loadFiles(currentPath);
      fetchAndShowSidebarTree(currentPath);
      showMainTree(currentPath);
    } else {
      showToast("Errore durante la rinomina: " + (data.message || "Errore sconosciuto"), "error");
    }
  } catch (err) {
    console.error("Errore rinomina:", err);
    showToast("Errore durante la rinomina", "error");
  }
}

// =============================================
//  FUNZIONE DOWNLOAD ZIP CARTELLA/FILE
// =============================================

async function downloadItemAsZip(filePath, fileName) {
  try {
    const encodedPath = encodeURIComponent(filePath);
    const zipUrl = `/api/download-zip/${encodedPath}`;
    
    const link = document.createElement("a");
    link.href = zipUrl;
    link.click();
    
    showToast(`Download di "${fileName}.zip" avviato`, "success");
  } catch (err) {
    console.error("Errore download:", err);
    showToast("Errore durante il download", "error");
  }
}

// =============================================
//  FUNZIONE DOWNLOAD ZIP VISUALIZZAZIONE CORRENTE
// =============================================

async function downloadCurrentView() {
  try {
    const folderName = currentPath ? currentPath.split("/").pop() : "files";
    
    showToast(`Preparazione download "${folderName}.zip"...`, "info");
    
    const response = await fetch("/api/download-current-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: currentPath }),
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error(`Errore HTTP ${response.status}`);
    }

    // Ottieni il blob dallo stream della risposta
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
//  SELEZIONE FILE
// =============================================

function selectFiles() {
  document.getElementById("fileInput").click();
}

function selectFolder() {
  document.getElementById("folderInput").click();
}

function handleFileSelection(e) {
  const files = Array.from(e.target.files);
  selectedFiles = files;
  displaySelectedFiles();
  document.getElementById("folderInput").value = "";
}

function handleFolderSelection(e) {
  const files = Array.from(e.target.files);
  mainFolderNames = [];
  if (files.length > 0) {
    files.forEach((file) => {
      const relPath = file.webkitRelativePath;
      if (relPath && relPath.includes("/")) {
        const folder = relPath.split("/")[0];
        if (!mainFolderNames.includes(folder)) {
          mainFolderNames.push(folder);
        }
      }
    });
  }
  selectedFiles = files;
  displaySelectedFiles();
  document.getElementById("fileInput").value = "";
}

function displaySelectedFiles() {
  const container = document.getElementById("selectedFiles");
  const filesList = document.getElementById("filesList");

  if (!selectedFiles.length) {
    container.style.display = "none";
    return;
  }

  let rootFolder = "";
  if (
    selectedFiles[0].webkitRelativePath &&
    selectedFiles[0].webkitRelativePath.includes("/")
  ) {
    rootFolder = selectedFiles[0].webkitRelativePath.split("/")[0];
  }

  const tree = {};
  selectedFiles.forEach((file) => {
    let relPath = file.webkitRelativePath || file.name;
    if (rootFolder && !relPath.startsWith(rootFolder)) {
      relPath = rootFolder + "/" + relPath;
    }
    const parts = relPath.split("/");
    let node = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        if (!node.files) node.files = [];
        node.files.push(part);
      } else {
        if (!node[part]) node[part] = {};
        node = node[part];
      }
    }
  });

  function renderTree(node, level = 0) {
    let html = '<ul style="margin-left:' + level * 20 + 'px">';
    for (const key in node) {
      if (key === "files") {
        node.files.forEach((f) => {
          html += `<li><i class='fas fa-file'></i> ${f}</li>`;
        });
      } else {
        html += `<li><i class='fas fa-folder'></i> <b>${key}</b>`;
        html += renderTree(node[key], level + 1);
        html += "</li>";
      }
    }
    html += "</ul>";
    return html;
  }

  filesList.innerHTML = `
    <div class="mb-2"><b>Anteprima struttura che verrà caricata:</b></div>
    ${renderTree(tree)}
  `;
  container.style.display = "block";
}

async function startUpload() {
  if (!selectedFiles.length) {
    showToast("Seleziona file o cartelle prima di caricare", "warning");
    return;
  }
  if (isUploading) {
    showToast("Caricamento già in corso", "warning");
    return;
  }
  isUploading = true;
  const formData = new FormData();
  let allFolders = new Set();
  const relativePaths = [];
  selectedFiles.forEach((file) => {
    let relPath = file.webkitRelativePath || file.name;
    if (currentPath) {
      relPath = currentPath + "/" + relPath;
    }
    relPath = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
    relativePaths.push(relPath);
    formData.append("files", file, relPath);
    formData.append("relativePaths[]", relPath);
    const parts = relPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      allFolders.add(parts.slice(0, i).join("/"));
    }
  });
  formData.append("relativePaths", JSON.stringify(relativePaths));
  formData.append("folders", JSON.stringify(Array.from(allFolders)));

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    });
    const data = await response.json();
    isUploading = false;
    if (!response.ok || !data.success) {
      showToast(
        "Errore durante il caricamento: " +
          (data.message || data.error || "Errore sconosciuto"),
        "danger",
      );
      return;
    }
    showToast(`✅ ${data.totalFiles || 0} file caricati con successo!`, "success");
    clearSelection();
    loadFiles(currentPath);
    fetchAndShowSidebarTree(currentPath);
    showMainTree(currentPath);
  } catch (error) {
    console.error("Errore upload:", error);
    showToast("Errore durante il caricamento dei file", "danger");
    isUploading = false;
  }
}

function clearSelection() {
  selectedFiles = [];
  document.getElementById("fileInput").value = "";
  document.getElementById("folderInput").value = "";
  document.getElementById("selectedFiles").style.display = "none";
  document.getElementById("filesList").innerHTML = "";
}

function updateUploadProgress(data) {
  console.log(`Upload: ${data.processed}/${data.total} (${data.percentage}%)`);
}

// =============================================
//  BROWSER FILE
// =============================================

function loadFiles(folderPath) {
  currentPath = folderPath;
  updateBreadcrumb(folderPath);

  const fileList = document.getElementById("fileList");
  fileList.innerHTML =
    '<tr><td colspan="4" class="text-center py-4"><i class="fas fa-spinner fa-spin me-2"></i>Caricamento...</td></tr>';

  fetch(`/api/files?folder=${encodeURIComponent(folderPath)}`)
    .then((res) => res.json())
    .then((files) => {
      displayFiles(files, folderPath);
    })
    .catch((err) => {
      console.error("Errore nel caricamento file:", err);
      fileList.innerHTML =
        '<tr><td colspan="4" class="text-center text-danger py-4">Errore nel caricamento file</td></tr>';
    });
}

function displayFiles(files, folderPath) {
  const sidebar = document.getElementById("sidebarTree");

  const tree = {};
  files.forEach((item) => {
    const parts = item.path.split("/");
    let node = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        if (item.type === "folder") {
          if (!node[part]) node[part] = {};
        } else {
          if (!node.files) node.files = [];
          node.files.push(part);
        }
      } else {
        if (!node[part]) node[part] = {};
        node = node[part];
      }
    }
  });

  function renderTree(node, level = 0) {
    let html = '<ul style="margin-left:' + level * 16 + 'px">';
    for (const key in node) {
      if (key === "files") {
        node.files.forEach((f) => {
          html += `<li><i class='fas fa-file'></i> ${f}</li>`;
        });
      } else {
        html += `<li><i class='fas fa-folder'></i> <b>${key}</b>`;
        html += renderTree(node[key], level + 1);
        html += "</li>";
      }
    }
    html += "</ul>";
    return html;
  }

  if (sidebar) {
    sidebar.innerHTML = `<div class='mb-2'><b>Struttura Cloud</b></div>${renderTree(tree)}`;
  }

  const fileList = document.getElementById("fileList");
  fileList.innerHTML = "";

  if (folderPath !== "") {
    const parentPath = folderPath.split("/").slice(0, -1).join("/");
    const row = document.createElement("tr");
    row.className = "fade-in";
    row.innerHTML = `
      <td>
          <i class="fas fa-level-up-alt file-icon text-secondary"></i>
          <a href="#" onclick="loadFiles('${parentPath}')" class="text-decoration-none">
              <strong>.. (Directory Padre)</strong>
          </a>
      </td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
    `;
    fileList.appendChild(row);
  }

  if (files.length === 0 && folderPath === "") {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td colspan="4" class="text-center text-muted py-5">
          <i class="fas fa-folder-open fa-3x mb-3 text-muted"></i>
          <br><strong>Nessun file caricato</strong>
          <br><small>Inizia caricando alcuni file o cartelle!</small>
      </td>
    `;
    fileList.appendChild(row);
    return;
  }

  files.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "it", { numeric: true });
  });

  files.forEach((file) => {
    const row = document.createElement("tr");
    row.className = "fade-in file-row";
    row.setAttribute("data-file-type", file.type);
    row.setAttribute("data-file-name", file.name.toLowerCase());

    const icon = getFileIcon(file);
    const size = file.type === "folder" ? "-" : formatFileSize(file.size);
    const modified = new Date(file.modified).toLocaleDateString("it-IT");

    // Pulsante download zip per cartelle/file
    const downloadZipBtn = `
      <button onclick="downloadItemAsZip('${file.path}', '${file.name}')" 
              class="btn btn-outline-info btn-sm" 
              title="Scarica come ZIP">
        <i class="fas fa-download"></i>
      </button>`;

    // Pulsante rinomina (penna) - visibile a tutti gli utenti loggati
    const renameBtn = `
      <button onclick="openRenameModal('${file.path}', '${file.type}')" 
              class="btn btn-outline-secondary btn-sm" 
              title="Rinomina">
        <i class="fas fa-pen"></i>
      </button>`;

    // Pulsante download solo per file singoli
    const downloadBtn = file.type === "file"
      ? `<a href="/download/${file.path}" class="btn btn-outline-primary btn-sm" title="Scarica file singolo">
           <i class="fas fa-file-download"></i>
         </a>`
      : "";

    // Pulsante elimina solo per admin
    const deleteBtn = userRole === "admin"
      ? `<button onclick="deleteItem('${file.path}', '${file.name}')" class="btn btn-outline-danger btn-sm" title="Elimina">
           <i class="fas fa-trash"></i>
         </button>`
      : "";

    row.innerHTML = `
      <td>
          <i class="${icon} file-icon me-2"></i>
          ${
            file.type === "folder"
              ? `<a href="#" onclick="loadFiles('${file.path}')" class="text-decoration-none folder-link">
                   <strong>${file.name}</strong>
                   <i class="fas fa-chevron-right ms-1 text-muted small"></i>
                 </a>`
              : `<span class="file-name">${file.name}</span>`
          }
      </td>
      <td><span class="text-muted">${size}</span></td>
      <td><span class="text-muted small">${modified}</span></td>
      <td>
        <div class="file-actions">
          ${downloadBtn}
          ${downloadZipBtn}
          ${renameBtn}
          ${deleteBtn}
        </div>
      </td>
    `;
    fileList.appendChild(row);
  });
}

function refreshFiles() {
  loadFiles(currentPath);
  showToast("File aggiornati", "info");
}

function deleteItem(path, name) {
  if (!confirm(`Sei sicuro di voler eliminare "${name}"?`)) return;

  fetch(`/api/delete/${path}`, {
    method: "DELETE",
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        showToast(`"${name}" eliminato con successo`, "success");
        loadFiles(currentPath);
      } else {
        showToast("Eliminazione fallita: " + (data.message || data.error), "error");
      }
    })
    .catch((err) => {
      console.error("Eliminazione fallita:", err);
      showToast("Eliminazione fallita", "error");
    });
}

async function confirmDeleteAll() {
  const confirmText = document.getElementById("confirmText").value;

  if (confirmText !== "ELIMINA TUTTO") {
    showToast("Testo di conferma non corretto", "error");
    return;
  }

  const sessionValid = await checkSession();
  if (!sessionValid) return;

  if (userRole !== "admin") {
    showToast("Solo gli amministratori possono eliminare tutti i file", "error");
    return;
  }

  try {
    const response = await fetch("/api/delete-all", {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
    });

    if (response.status === 401) {
      showToast("Sessione scaduta. Reindirizzamento al login...", "error");
      setTimeout(() => { window.location.href = "/login.html?error=session_expired"; }, 2000);
      return;
    }

    if (response.status === 403) {
      showToast("Accesso negato. Solo gli amministratori possono eliminare tutti i file.", "error");
      return;
    }

    const data = await response.json();

    if (data.success) {
      showToast(data.message, "success");
      loadFiles("");

      const modal = bootstrap.Modal.getInstance(document.getElementById("deleteAllModal"));
      modal.hide();
      document.getElementById("confirmText").value = "";
      document.getElementById("confirmDeleteAll").disabled = true;
    } else {
      showToast("Eliminazione fallita: " + (data.message || data.error), "error");
    }
  } catch (err) {
    console.error("Errore eliminazione totale:", err);
    showToast("Errore durante l'eliminazione", "error");
  }
}

function deleteAllFiles() {
  const modal = new bootstrap.Modal(document.getElementById("deleteAllModal"));
  modal.show();
}

// =============================================
//  UTILITÀ
// =============================================

function updateBreadcrumb(path) {
  const breadcrumb = document.getElementById("breadcrumb");
  breadcrumb.innerHTML =
    '<li class="breadcrumb-item"><a href="#" onclick="loadFiles(\'\')"><i class="fas fa-home me-1"></i>Home</a></li>';

  if (path) {
    const parts = path.split("/");
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath += (index > 0 ? "/" : "") + part;
      const isLast = index === parts.length - 1;

      const li = document.createElement("li");
      li.className = `breadcrumb-item ${isLast ? "active" : ""}`;

      if (isLast) {
        li.innerHTML = `<span class="text-muted">${part}</span>`;
      } else {
        li.innerHTML = `<a href="#" onclick="loadFiles('${currentPath}')">${part}</a>`;
      }

      breadcrumb.appendChild(li);
    });
  }
}

function getFileIcon(file) {
  if (file.type === "folder") return "fas fa-folder text-warning";

  const ext = file.name.split(".").pop().toLowerCase();

  if (["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"].includes(ext))
    return "fas fa-image text-success";
  else if (["pdf", "doc", "docx", "txt", "rtf", "odt"].includes(ext))
    return "fas fa-file-alt text-primary";
  else if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext))
    return "fas fa-file-archive text-secondary";
  else if (["mp4", "avi", "mkv", "mov", "wmv", "flv", "webm"].includes(ext))
    return "fas fa-file-video text-danger";
  else if (["mp3", "wav", "flac", "aac", "ogg", "wma"].includes(ext))
    return "fas fa-file-audio text-info";
  else if (["js", "html", "css", "php", "py", "java", "cpp", "c"].includes(ext))
    return "fas fa-file-code text-dark";
  else
    return "fas fa-file text-muted";
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Byte";
  const k = 1024;
  const sizes = ["Byte", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toastContainer");
  const toastId = "toast-" + Date.now();

  const toastColors = {
    success: "text-bg-success",
    error: "text-bg-danger",
    warning: "text-bg-warning",
    info: "text-bg-info",
  };

  const toastIcons = {
    success: "fas fa-check-circle",
    error: "fas fa-exclamation-triangle",
    warning: "fas fa-exclamation-circle",
    info: "fas fa-info-circle",
  };

  const toastEl = document.createElement("div");
  toastEl.id = toastId;
  toastEl.className = `toast ${toastColors[type] || toastColors.info}`;
  toastEl.setAttribute("role", "alert");
  toastEl.innerHTML = `
    <div class="toast-header">
        <i class="${toastIcons[type] || toastIcons.info} me-2"></i>
        <strong class="me-auto">Gestore File</strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
    </div>
    <div class="toast-body">${message}</div>
  `;

  toastContainer.appendChild(toastEl);
  const toast = new bootstrap.Toast(toastEl);
  toast.show();

  toastEl.addEventListener("hidden.bs.toast", () => {
    toastEl.remove();
  });
}

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

  const fullPath = currentPath ? `${currentPath}/${folderName}` : folderName;

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
        loadFiles(currentPath);
        fetchAndShowSidebarTree(currentPath);
        showMainTree(currentPath);
      } else {
        showToast("Errore: " + (data.message || "Impossibile creare la cartella."), "error");
      }
    })
    .catch((err) => {
      console.error("Errore nella creazione:", err);
      showToast("Errore durante la creazione della cartella.", "error");
    });
}

async function fetchAndShowSidebarTree(folder = "") {
  const sidebar = document.getElementById("sidebarTree");
  if (!sidebar) return;
  try {
    const res = await fetch(
      `/api/tree${folder ? `?folder=${encodeURIComponent(folder)}` : ""}`,
    );
    const tree = await res.json();
    function renderTree(node, level = 0) {
      let html = '<ul style="margin-left:' + level * 16 + 'px">';
      for (const folderName in node.folders) {
        html += `<li><i class='fas fa-folder'></i> <b>${folderName}</b>`;
        html += renderTree(node.folders[folderName], level + 1);
        html += "</li>";
      }
      if (node.files) {
        node.files.forEach((f) => {
          html += `<li><i class='fas fa-file'></i> ${f}</li>`;
        });
      }
      html += "</ul>";
      return html;
    }
    sidebar.innerHTML = `<div class='mb-2'><b>Struttura Cloud</b></div>${renderTree(tree)}`;
  } catch (e) {
    sidebar.innerHTML = '<div class="text-danger">Errore caricamento struttura cloud</div>';
  }
}

async function showMainTree(folder = "") {
  const mainContainer = document.getElementById("mainTree");
  if (!mainContainer) return;
  try {
    const res = await fetch(
      `/api/tree${folder ? `?folder=${encodeURIComponent(folder)}` : ""}`,
    );
    const tree = await res.json();
    function renderTree(node, level = 0) {
      let html = '<ul style="margin-left:' + level * 16 + 'px">';
      for (const folderName in node.folders) {
        html += `<li><i class='fas fa-folder'></i> <b>${folderName}</b>`;
        html += renderTree(node.folders[folderName], level + 1);
        html += "</li>";
      }
      if (node.files) {
        node.files.forEach((f) => {
          html += `<li><i class='fas fa-file'></i> ${f}</li>`;
        });
      }
      html += "</ul>";
      return html;
    }
    mainContainer.innerHTML = `<div class='mb-2'><b>Contenuto Cloud</b></div>${renderTree(tree)}`;
  } catch (e) {
    mainContainer.innerHTML = '<div class="text-danger">Errore caricamento struttura cloud</div>';
  }
}

window.addEventListener("DOMContentLoaded", () => {
  fetchAndShowSidebarTree();
  showMainTree();
});