// Variabili globali
let currentPath = "";
let selectedFiles = [];
let socket;
let userRole = "user";
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
  // Carica info sessione utente
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

      userRole = data.role;
      document.getElementById("userInfo").innerHTML =
        `<i class="fas fa-user me-1"></i>${data.username} (${data.role})`;

      if (data.role === "admin") {
        document.getElementById("adminBtn").style.display = "inline-block";
        document.getElementById("deleteAllBtn").style.display = "inline-block";
      }
    })
    .catch((err) => {
      console.error("Errore nel caricamento info sessione:", err);
      showToast(
        "Errore di autenticazione. Reindirizzamento al login...",
        "error",
      );
      setTimeout(() => {
        window.location.href = "/login.html?error=auth_error";
      }, 2000);
    });

  // Carica lista file iniziale
  loadFiles("");

  // Controllo sessione periodico ogni 5 minuti
  setInterval(
    async () => {
      const valid = await checkSession();
      if (!valid) {
        console.log("⏰ Controllo periodico: sessione scaduta");
      }
    },
    5 * 60 * 1000,
  ); // 5 minuti
}

function setupEventListeners() {
  const fileInput = document.getElementById("fileInput");
  const folderInput = document.getElementById("folderInput");
  const confirmText = document.getElementById("confirmText");

  // Eventi input file
  fileInput.addEventListener("change", handleFileSelection);
  folderInput.addEventListener("change", handleFolderSelection);

  // Controllo testo conferma eliminazione
  if (confirmText) {
    confirmText.addEventListener("input", (e) => {
      const confirmBtn = document.getElementById("confirmDeleteAll");
      confirmBtn.disabled = e.target.value !== "ELIMINA TUTTO";
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
  });
}

// Funzioni Selezione File
function selectFiles() {
  document.getElementById("fileInput").click();
}

function selectFolder() {
  document.getElementById("folderInput").click();
}

function handleFileSelection(e) {
  const files = Array.from(e.target.files);
  console.log("=== SELEZIONE FILE INDIVIDUALI ===");
  console.log(`📄 File selezionati: ${files.length}`);

  files.forEach((file, index) => {
    console.log(`${index + 1}. ${file.name} (${formatFileSize(file.size)})`);
  });

  selectedFiles = files;
  displaySelectedFiles();

  // Pulisci l'altro input
  document.getElementById("folderInput").value = "";
}

function handleFolderSelection(e) {
  const files = Array.from(e.target.files);
  mainFolderNames = [];
  if (files.length > 0) {
    // Ricava tutti i nomi delle cartelle principali selezionate
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
  const previewTree = document.getElementById("uploadPreviewTree");

  if (!selectedFiles.length) {
    container.style.display = "none";
    if (previewTree) previewTree.innerHTML = "";
    return;
  }

  // Trova la cartella principale (root) dal primo file selezionato
  let rootFolder = "";
  if (
    selectedFiles[0].webkitRelativePath &&
    selectedFiles[0].webkitRelativePath.includes("/")
  ) {
    rootFolder = selectedFiles[0].webkitRelativePath.split("/")[0];
  } else if (selectedFiles[0].webkitRelativePath) {
    rootFolder = selectedFiles[0].webkitRelativePath;
  } else if (selectedFiles[0].name && selectedFiles.length === 1) {
    rootFolder = selectedFiles[0].name;
  }

  // Costruisci la struttura ad albero forzando la root
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
  if (previewTree) {
    previewTree.innerHTML = `<div class='mb-2'><b>Anteprima Upload</b></div>${renderTree(tree)}`;
  }
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
  selectedFiles.forEach((file) => {
    let relPath = file.webkitRelativePath || file.name;
    // Se sei in una sottocartella, aggiungi currentPath davanti
    if (currentPath) {
      relPath = currentPath + "/" + relPath;
    }
    relPath = relPath.replace(/^\/+/, ""); // rimuovi eventuali slash iniziali
    formData.append("files", file, relPath);
    const parts = relPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      allFolders.add(parts.slice(0, i).join("/"));
    }
  });
  formData.append("folders", JSON.stringify(Array.from(allFolders)));

  // Mostra barra progresso
  document.getElementById("uploadProgress").style.display = "block";
  document.getElementById("selectedFiles").style.display = "none";

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    });
    const data = await response.json();
    isUploading = false;
    document.getElementById("uploadProgress").style.display = "none";
    if (!response.ok || !data.success) {
      showToast(
        "Errore durante il caricamento: " +
          (data.message || data.error || "Errore sconosciuto"),
        "danger",
      );
      return;
    }
    showToast(
      `✅ ${data.totalFiles || 0} file caricati con successo!`,
      "success",
    );
    clearSelection();
    loadFiles(currentPath); // aggiorna la vista della cartella corrente
    fetchAndShowSidebarTree(currentPath);
    showMainTree(currentPath);
  } catch (error) {
    console.error("Errore upload:", error);
    showToast("Errore durante il caricamento dei file", "danger");
    isUploading = false;
    document.getElementById("uploadProgress").style.display = "none";
  }
}

// Funzione helper per analizzare la struttura dei file
function analyzeFileStructure(files) {
  const folders = new Set();
  let rootFiles = 0;
  let maxDepth = 0;

  files.forEach((file) => {
    const path = file.webkitRelativePath || file.name;

    if (path.includes("/")) {
      const dirPath = path.substring(0, path.lastIndexOf("/"));
      const depth = dirPath.split("/").length;
      maxDepth = Math.max(maxDepth, depth);

      // Aggiungi tutte le directory nel percorso
      const parts = dirPath.split("/");
      let currentPath = "";
      parts.forEach((part) => {
        currentPath += (currentPath ? "/" : "") + part;
        folders.add(currentPath);
      });
    } else {
      rootFiles++;
    }
  });

  return {
    foldersToCreate: folders.size,
    rootFiles: rootFiles,
    maxDepth: maxDepth,
    folderList: Array.from(folders).sort(),
  };
}

function updateUploadProgress(data) {
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");

  progressBar.style.width = `${data.percentage}%`;
  progressText.textContent = `${data.processed}/${data.total} file (${data.percentage}%)`;

  // Mostra informazioni dettagliate sul file corrente
  if (data.currentFolder && data.currentPath) {
    const currentFileInfo = document.createElement("div");
    currentFileInfo.className = "current-file-info mt-2 small text-muted";
    currentFileInfo.innerHTML = `
      <i class="fas fa-upload me-1"></i>
      <strong>${data.currentFile}</strong> → 
      <i class="fas fa-folder me-1"></i>${data.currentFolder}
    `;

    // Sostituisci le info precedenti
    const existingInfo = document.querySelector(".current-file-info");
    if (existingInfo) {
      existingInfo.replaceWith(currentFileInfo);
    } else {
      document.getElementById("uploadProgress").appendChild(currentFileInfo);
    }
  }
}

// Funzioni Browser File
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

function loadFilesAndScrollToNew(folderPath) {
  const oldFileCount = document.getElementById("fileList").children.length;

  loadFiles(folderPath);

  // Scorri verso il basso dopo un breve ritardo per permettere il rendering
  setTimeout(() => {
    const newRows = document.getElementById("fileList").children;

    if (newRows.length > oldFileCount) {
      // Scorri verso gli ultimi file aggiunti
      const lastRow = newRows[newRows.length - 1];
      if (lastRow) {
        lastRow.scrollIntoView({ behavior: "smooth", block: "center" });
        // Evidenzia brevemente i nuovi file
        for (let i = oldFileCount; i < newRows.length; i++) {
          if (newRows[i]) {
            newRows[i].classList.add("new-file-highlight");
            setTimeout(() => {
              newRows[i].classList.remove("new-file-highlight");
            }, 3000);
          }
        }
      }
    }
  }, 500);
}

function displayFiles(files, folderPath) {
  const filesContainer = document.getElementById("filesContainer");
  const sidebar = document.getElementById("sidebarTree"); // Assicurati che esista un elemento con questo id

  // Costruisci una struttura ad albero dai file ricevuti
  const tree = {};
  files.forEach((item) => {
    const parts = item.path.split("/");
    let node = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // È un file o una cartella
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

  // Funzione ricorsiva per generare HTML ad albero
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

  // Mostra la struttura ad albero nella sidebar
  if (sidebar) {
    sidebar.innerHTML = `<div class='mb-2'><b>Struttura Cloud</b></div>${renderTree(tree)}`;
  }

  const fileList = document.getElementById("fileList");
  fileList.innerHTML = "";

  // Aggiungi link directory padre se non alla radice
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
          <br><small class="text-primary">Il sistema ricreerà automaticamente la struttura originale</small>
      </td>
    `;
    fileList.appendChild(row);
    return;
  }

  // Ordina: cartelle prima, poi file alfabeticamente
  files.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "it", { numeric: true });
  });

  files.forEach((file, index) => {
    const row = document.createElement("tr");
    row.className = "fade-in file-row";
    row.setAttribute("data-file-type", file.type);
    row.setAttribute("data-file-name", file.name.toLowerCase());

    const icon = getFileIcon(file);
    const size = file.type === "folder" ? "-" : formatFileSize(file.size);
    const modified = new Date(file.modified).toLocaleDateString("it-IT");

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
      <td class="file-actions">
          ${
            file.type === "file"
              ? `<a href="/download/${file.path}" class="btn btn-outline-primary btn-sm me-1" title="Scarica">
                   <i class="fas fa-download"></i>
                 </a>`
              : ""
          }
          ${
            userRole === "admin"
              ? `<button onclick="deleteItem('${file.path}', '${file.name}')" class="btn btn-outline-danger btn-sm" title="Elimina">
                   <i class="fas fa-trash"></i>
                 </button>`
              : ""
          }
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
        showToast(
          "Eliminazione fallita: " + (data.message || data.error),
          "error",
        );
      }
    })
    .catch((err) => {
      console.error("Eliminazione fallita:", err);
      showToast("Eliminazione fallita", "error");
    });
}

// Funzione Elimina Tutto
async function confirmDeleteAll() {
  const confirmText = document.getElementById("confirmText").value;

  if (confirmText !== "ELIMINA TUTTO") {
    showToast("Testo di conferma non corretto", "error");
    return;
  }

  // Controlla sessione e permessi
  const sessionValid = await checkSession();
  if (!sessionValid) {
    return;
  }

  if (userRole !== "admin") {
    showToast(
      "Solo gli amministratori possono eliminare tutti i file",
      "error",
    );
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
      setTimeout(() => {
        window.location.href = "/login.html?error=session_expired";
      }, 2000);
      return;
    }

    if (response.status === 403) {
      showToast(
        "Accesso negato. Solo gli amministratori possono eliminare tutti i file.",
        "error",
      );
      return;
    }

    const data = await response.json();

    if (data.success) {
      showToast(data.message, "success");
      loadFiles("");

      // Chiudi modal e resetta form
      const modal = bootstrap.Modal.getInstance(
        document.getElementById("deleteAllModal"),
      );
      modal.hide();
      document.getElementById("confirmText").value = "";
      document.getElementById("confirmDeleteAll").disabled = true;
    } else {
      showToast(
        "Eliminazione fallita: " + (data.message || data.error),
        "error",
      );
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

// Funzioni Utilità
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
  if (file.type === "folder") {
    return "fas fa-folder text-warning";
  }

  const ext = file.name.split(".").pop().toLowerCase();

  if (["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"].includes(ext)) {
    return "fas fa-image text-success";
  } else if (["pdf", "doc", "docx", "txt", "rtf", "odt"].includes(ext)) {
    return "fas fa-file-alt text-primary";
  } else if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)) {
    return "fas fa-file-archive text-secondary";
  } else if (["mp4", "avi", "mkv", "mov", "wmv", "flv", "webm"].includes(ext)) {
    return "fas fa-file-video text-danger";
  } else if (["mp3", "wav", "flac", "aac", "ogg", "wma"].includes(ext)) {
    return "fas fa-file-audio text-info";
  } else if (
    ["js", "html", "css", "php", "py", "java", "cpp", "c"].includes(ext)
  ) {
    return "fas fa-file-code text-dark";
  } else {
    return "fas fa-file text-muted";
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Byte";

  const k = 1024;
  const sizes = ["Byte", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (
    Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  );
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

  // Rimuovi elemento toast dopo che è nascosto
  toastEl.addEventListener("hidden.bs.toast", () => {
    toastEl.remove();
  });
}

function createNewFolder() {
  const input = document.getElementById("newFolderName");
  const folderName = input.value.trim();

  if (!folderName || folderName.includes("..")) {
    alert("Inserisci un nome valido per la cartella.");
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
        loadFiles(currentPath);
        showToast("Cartella creata con successo!", "success");
      } else {
        alert("Errore: " + (data.message || "Impossibile creare la cartella."));
      }
    })
    .catch((err) => {
      console.error("Errore nella creazione:", err);
      alert("Errore durante la creazione della cartella.");
    });
}

// Funzione per mostrare la struttura reale del cloud nella sidebar
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
    sidebar.innerHTML =
      '<div class="text-danger">Errore caricamento struttura cloud</div>';
  }
}

// Funzione per mostrare la struttura reale del cloud nella parte centrale
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
    mainContainer.innerHTML =
      '<div class="text-danger">Errore caricamento struttura cloud</div>';
  }
}

// Chiamala all'avvio e dopo ogni upload
window.addEventListener("DOMContentLoaded", () => {
  fetchAndShowSidebarTree();
  showMainTree();
});
// Dopo ogni upload successo:
// fetchAndShowSidebarTree(currentPath);
// showMainTree(currentPath);
