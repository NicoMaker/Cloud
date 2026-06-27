// =============================================
//  BROWSER FILE — Caricamento & visualizzazione
// =============================================

function loadFiles(folderPath) {
  window.currentPath = folderPath;
  updateBreadcrumb(folderPath);

  const fileList = document.getElementById("fileList");
  fileList.innerHTML =
    '<tr><td colspan="4" class="table-placeholder"><i class="fas fa-spinner fa-spin"></i> Caricamento…</td></tr>';

  fetch(`/api/files?folder=${encodeURIComponent(folderPath)}`)
    .then((res) => res.json())
    .then((files) => displayFiles(files, folderPath))
    .catch((err) => {
      console.error("Errore caricamento file:", err);
      fileList.innerHTML =
        '<tr><td colspan="4" class="table-placeholder" style="color:#ef4444"><i class="fas fa-circle-exclamation me-2"></i>Errore nel caricamento file</td></tr>';
    });
}

function displayFiles(files, folderPath) {
  const fileList = document.getElementById("fileList");
  fileList.innerHTML = "";

  // Riga torna indietro
  if (folderPath !== "") {
    const parentPath = folderPath.split("/").slice(0, -1).join("/");
    const row = document.createElement("tr");
    row.className = "fade-in";
    row.innerHTML = `
      <td>
        <div class="file-icon-cell">
          <i class="fas fa-level-up-alt" style="color:var(--text-3);width:18px;text-align:center"></i>
          <a href="#" onclick="loadFiles('${parentPath}')" class="file-name-link">
            <strong>.. (Directory Padre)</strong>
          </a>
        </div>
      </td>
      <td class="file-size">—</td>
      <td class="file-date">—</td>
      <td>—</td>
    `;
    fileList.appendChild(row);
  }

  // Cartella vuota
  if (files.length === 0 && folderPath === "") {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td colspan="4" class="table-placeholder" style="padding:4rem 1rem;">
        <i class="fas fa-folder-open" style="font-size:2.5rem;color:var(--text-3);display:block;margin-bottom:.75rem;"></i>
        <strong style="color:var(--text-2)">Nessun file caricato</strong><br>
        <span style="font-size:.82rem;color:var(--text-3)">Trascina file nel pannello a sinistra per iniziare</span>
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
    row.className = "fade-in";

    const icon     = getFileIcon(file);
    const size     = file.type === "folder" ? "—" : formatFileSize(file.size);
    const modified = new Date(file.modified).toLocaleDateString("it-IT");

    const downloadBtn = file.type === "file"
      ? `<a href="/download/${file.path}" class="dash-btn dash-btn-outline-success dash-btn-sm" title="Scarica file">
           <i class="fas fa-file-arrow-down"></i>
         </a>`
      : "";

    const downloadZipBtn = `
      <button onclick="downloadItemAsZip('${file.path}','${file.name}')"
              class="dash-btn dash-btn-outline-info dash-btn-sm" title="Scarica come ZIP">
        <i class="fas fa-download"></i>
      </button>`;

    const renameBtn = `
      <button onclick="openRenameModal('${file.path}','${file.type}')"
              class="dash-btn dash-btn-outline-secondary dash-btn-sm" title="Rinomina">
        <i class="fas fa-pen"></i>
      </button>`;

    const copyBtn = `
      <button onclick="openCopyModal('${file.path}')"
              class="dash-btn dash-btn-outline-primary dash-btn-sm" title="Copia">
        <i class="fas fa-copy"></i>
      </button>`;

    const moveBtn = window.userRole === "admin"
      ? `<button onclick="openMoveModal('${file.path}')"
                 class="dash-btn dash-btn-outline-warning dash-btn-sm" title="Sposta">
           <i class="fas fa-arrows-alt"></i>
         </button>`
      : "";

    const deleteBtn = window.userRole === "admin"
      ? `<button onclick="deleteItem('${file.path}','${file.name}')"
                 class="dash-btn dash-btn-outline-danger dash-btn-sm" title="Elimina">
           <i class="fas fa-trash"></i>
         </button>`
      : "";

    row.innerHTML = `
      <td>
        <div class="file-icon-cell">
          <i class="${icon}" style="width:18px;text-align:center;font-size:.95rem;"></i>
          ${file.type === "folder"
            ? `<a href="#" onclick="loadFiles('${file.path}')" class="file-name-link">
                 <strong>${file.name}</strong>
                 <i class="fas fa-chevron-right" style="font-size:.65rem;color:var(--text-3)"></i>
               </a>`
            : `<span class="file-name-text">${file.name}</span>`
          }
        </div>
      </td>
      <td class="file-size">${size}</td>
      <td class="file-date">${modified}</td>
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
        showToast(`"${name}" eliminato`, "success");
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
      showToast("Sessione scaduta. Reindirizzamento…", "error");
      setTimeout(() => { window.location.href = "/login.html?error=session_expired"; }, 2000);
      return;
    }
    if (response.status === 403) {
      showToast("Accesso negato.", "error");
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
    showToast("Errore durante l'eliminazione", "error");
  }
}

// =============================================
//  UTILITÀ
// =============================================

function updateBreadcrumb(path) {
  const breadcrumb = document.getElementById("breadcrumb");
  breadcrumb.innerHTML =
    '<li class="bc-item bc-active"><a href="#" onclick="loadFiles(\'\')"><i class="fas fa-home"></i> Home</a></li>';

  if (path) {
    const parts = path.split("/");
    let builtPath = "";
    parts.forEach((part, index) => {
      builtPath += (index > 0 ? "/" : "") + part;
      const isLast = index === parts.length - 1;
      const li = document.createElement("li");
      li.className = `bc-item ${isLast ? "bc-active" : ""}`;
      li.innerHTML = isLast
        ? `<span>${part}</span>`
        : `<a href="#" onclick="loadFiles('${builtPath}')">${part}</a>`;
      breadcrumb.appendChild(li);
    });
  }
}

function getFileIcon(file) {
  if (file.type === "folder") return "fas fa-folder" + " " + "text-warning";
  const ext = file.name.split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","gif","bmp","svg","webp"].includes(ext)) return "fas fa-image text-success";
  if (["pdf","doc","docx","txt","rtf","odt"].includes(ext))         return "fas fa-file-alt text-primary";
  if (["zip","rar","7z","tar","gz","bz2"].includes(ext))            return "fas fa-file-zipper text-secondary";
  if (["mp4","avi","mkv","mov","wmv","flv","webm"].includes(ext))   return "fas fa-file-video text-danger";
  if (["mp3","wav","flac","aac","ogg","wma"].includes(ext))         return "fas fa-file-audio text-info";
  if (["js","html","css","php","py","java","cpp","c"].includes(ext)) return "fas fa-file-code text-dark";
  return "fas fa-file text-muted";
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
