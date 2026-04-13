// =============================================
//  BROWSER FILE - CARICAMENTO & VISUALIZZAZIONE
// =============================================

function loadFiles(folderPath) {
  window.currentPath = folderPath;
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
  const fileList = document.getElementById("fileList");
  fileList.innerHTML = "";

  // Riga "torna indietro"
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
      <td>-</td><td>-</td><td>-</td>
    `;
    fileList.appendChild(row);
  }

  // Cartella vuota
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

    const icon = getFileIcon(file);
    const size = file.type === "folder" ? "-" : formatFileSize(file.size);
    const modified = new Date(file.modified).toLocaleDateString("it-IT");

    const downloadBtn = file.type === "file"
      ? `<a href="/download/${file.path}" class="btn btn-sm btn-outline-success" title="Scarica file">
           <i class="fas fa-file-download"></i>
         </a>`
      : "";

    const downloadZipBtn = `
      <button onclick="downloadItemAsZip('${file.path}', '${file.name}')"
              class="btn btn-sm btn-outline-info" title="Scarica come ZIP">
        <i class="fas fa-download"></i>
      </button>`;

    const renameBtn = `
      <button onclick="openRenameModal('${file.path}', '${file.type}')"
              class="btn btn-sm btn-outline-secondary" title="Rinomina">
        <i class="fas fa-pen"></i>
      </button>`;

    const copyBtn = `
      <button onclick="openCopyModal('${file.path}')"
              class="btn btn-sm btn-outline-primary" title="Copia">
        <i class="fas fa-copy"></i>
      </button>`;

    const moveBtn = `
      <button onclick="openMoveModal('${file.path}')"
              class="btn btn-sm btn-outline-warning" title="Sposta">
        <i class="fas fa-arrows-alt"></i>
      </button>`;

    const deleteBtn = window.userRole === "admin"
      ? `<button onclick="deleteItem('${file.path}', '${file.name}')"
                 class="btn btn-sm btn-outline-danger" title="Elimina">
           <i class="fas fa-trash"></i>
         </button>`
      : "";

    row.innerHTML = `
      <td>
          <i class="${icon} file-icon me-2"></i>
          ${file.type === "folder"
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
          ${downloadBtn}${downloadZipBtn}${renameBtn}${copyBtn}${moveBtn}${deleteBtn}
        </div>
      </td>
    `;
    fileList.appendChild(row);
  });
}

function refreshFiles() {
  loadFiles(window.currentPath);
  showToast("File aggiornati", "info");
}

function deleteItem(path, name) {
  if (!confirm(`Sei sicuro di voler eliminare "${name}"?`)) return;

  fetch(`/api/delete/${path}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        showToast(`"${name}" eliminato con successo`, "success");
        loadFiles(window.currentPath);
      } else {
        showToast("Eliminazione fallita: " + (data.message || data.error), "error");
      }
    })
    .catch(() => showToast("Eliminazione fallita", "error"));
}

async function deleteAllFiles() {
  const modal = new bootstrap.Modal(document.getElementById("deleteAllModal"));
  modal.show();
}

async function confirmDeleteAll() {
  const confirmText = document.getElementById("confirmText").value;
  if (confirmText !== "ELIMINA TUTTO") {
    showToast("Testo di conferma non corretto", "error");
    return;
  }

  const sessionValid = await checkSession();
  if (!sessionValid) return;

  if (window.userRole !== "admin") {
    showToast("Solo gli amministratori possono eliminare tutti i file", "error");
    return;
  }

  try {
    const response = await fetch("/api/delete-all", {
      method: "DELETE",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
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

// =============================================
//  UTILITÀ FILE
// =============================================

function updateBreadcrumb(path) {
  const breadcrumb = document.getElementById("breadcrumb");
  breadcrumb.innerHTML =
    '<li class="breadcrumb-item"><a href="#" onclick="loadFiles(\'\')"><i class="fas fa-home me-1"></i>Home</a></li>';

  if (path) {
    const parts = path.split("/");
    let builtPath = "";
    parts.forEach((part, index) => {
      builtPath += (index > 0 ? "/" : "") + part;
      const isLast = index === parts.length - 1;
      const li = document.createElement("li");
      li.className = `breadcrumb-item ${isLast ? "active" : ""}`;
      li.innerHTML = isLast
        ? `<span class="text-muted">${part}</span>`
        : `<a href="#" onclick="loadFiles('${builtPath}')">${part}</a>`;
      breadcrumb.appendChild(li);
    });
  }
}

function getFileIcon(file) {
  if (file.type === "folder") return "fas fa-folder text-warning";
  const ext = file.name.split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","gif","bmp","svg","webp"].includes(ext)) return "fas fa-image text-success";
  if (["pdf","doc","docx","txt","rtf","odt"].includes(ext)) return "fas fa-file-alt text-primary";
  if (["zip","rar","7z","tar","gz","bz2"].includes(ext)) return "fas fa-file-archive text-secondary";
  if (["mp4","avi","mkv","mov","wmv","flv","webm"].includes(ext)) return "fas fa-file-video text-danger";
  if (["mp3","wav","flac","aac","ogg","wma"].includes(ext)) return "fas fa-file-audio text-info";
  if (["js","html","css","php","py","java","cpp","c"].includes(ext)) return "fas fa-file-code text-dark";
  return "fas fa-file text-muted";
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Byte";
  const k = 1024;
  const sizes = ["Byte", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
