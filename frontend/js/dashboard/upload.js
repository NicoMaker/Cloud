// =============================================
//  UPLOAD FILE & CARTELLE
// =============================================

function selectFiles() {
  document.getElementById("fileInput").click();
}

function selectFolder() {
  document.getElementById("folderInput").click();
}

function handleFileSelection(e) {
  window.selectedFiles = Array.from(e.target.files);
  displaySelectedFiles();
  document.getElementById("folderInput").value = "";
}

function handleFolderSelection(e) {
  const files = Array.from(e.target.files);
  window.mainFolderNames = [];
  files.forEach((file) => {
    const relPath = file.webkitRelativePath;
    if (relPath && relPath.includes("/")) {
      const folder = relPath.split("/")[0];
      if (!window.mainFolderNames.includes(folder))
        window.mainFolderNames.push(folder);
    }
  });
  window.selectedFiles = files;
  displaySelectedFiles();
  document.getElementById("fileInput").value = "";
}

function displaySelectedFiles() {
  const container = document.getElementById("selectedFiles");
  const countLabel = document.getElementById("selectedCountLabel");
  const filesList = document.getElementById("filesList");
  const uploadZone = document.getElementById("uploadZone");

  if (!window.selectedFiles.length) {
    container.style.display = "none";
    uploadZone.style.display = "block";
    return;
  }

  // Aggiorna etichetta conteggio
  const count = window.selectedFiles.length;
  if (countLabel)
    countLabel.textContent = `${count} file selezionat${count === 1 ? "o" : "i"}`;

  // Nascondi zona drop e mostra preview
  uploadZone.style.display = "none";
  container.style.display = "block";

  // Costruisce albero
  let rootFolder = "";
  if (window.selectedFiles[0].webkitRelativePath?.includes("/")) {
    rootFolder = window.selectedFiles[0].webkitRelativePath.split("/")[0];
  }

  const tree = {};
  window.selectedFiles.forEach((file) => {
    let relPath = file.webkitRelativePath || file.name;
    if (rootFolder && !relPath.startsWith(rootFolder))
      relPath = rootFolder + "/" + relPath;
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
    let html = `<ul style="margin-left:${level * 14}px;list-style:none;padding:0;">`;
    for (const key in node) {
      if (key === "files") {
        node.files.forEach((f) => {
          html += `<li style="display:flex;align-items:center;gap:.35rem;padding:.1rem 0;">
                     <i class="fas fa-file" style="color:var(--text-3);font-size:.7rem;width:12px;"></i>
                     <span>${f}</span>
                   </li>`;
        });
      } else {
        html += `<li style="display:flex;flex-direction:column;gap:0;padding:.1rem 0;">
                   <span style="display:flex;align-items:center;gap:.35rem;font-weight:600;color:#2563eb;">
                     <i class="fas fa-folder" style="font-size:.7rem;width:12px;"></i>${key}
                   </span>
                   ${renderTree(node[key], level + 1)}
                 </li>`;
      }
    }
    html += "</ul>";
    return html;
  }

  filesList.innerHTML = renderTree(tree);
}

async function startUpload() {
  if (!window.selectedFiles.length) {
    showToast("Seleziona file prima di caricare", "warning");
    return;
  }
  if (window.isUploading) {
    showToast("Caricamento già in corso", "warning");
    return;
  }
  window.isUploading = true;

  const progressWrap = document.getElementById("uploadProgress");
  const selectedFiles = document.getElementById("selectedFiles");
  selectedFiles.style.display = "none";
  progressWrap.style.display = "block";
  progressWrap.innerHTML = `
    <div style="font-size:.82rem;font-weight:600;color:var(--brand);margin-bottom:.5rem;">
      <i class="fas fa-upload me-1"></i> Caricamento in corso…
    </div>
    <div class="progress-modern"><div class="progress-modern-bar" id="progressBar" style="width:0%"></div></div>
    <div style="font-size:.75rem;color:var(--text-3);margin-top:.35rem;" id="progressLabel">Preparazione…</div>
  `;

  // Simulate indeterminate progress
  let fakeP = 0;
  const fakeInterval = setInterval(() => {
    fakeP = Math.min(fakeP + Math.random() * 8, 85);
    const bar = document.getElementById("progressBar");
    if (bar) bar.style.width = fakeP + "%";
  }, 300);

  const formData = new FormData();
  const allFolders = new Set();
  const relativePaths = [];

  window.selectedFiles.forEach((file) => {
    let relPath = file.webkitRelativePath || file.name;
    if (window.currentPath) relPath = window.currentPath + "/" + relPath;
    relPath = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
    relativePaths.push(relPath);
    formData.append("files", file, relPath);
    formData.append("relativePaths[]", relPath);
    const parts = relPath.split("/");
    for (let i = 1; i < parts.length; i++)
      allFolders.add(parts.slice(0, i).join("/"));
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
    clearInterval(fakeInterval);
    window.isUploading = false;

    const bar = document.getElementById("progressBar");
    if (bar) bar.style.width = "100%";
    await new Promise((r) => setTimeout(r, 400));

    if (!response.ok || !data.success) {
      showToast(
        "Errore caricamento: " +
          (data.message || data.error || "Errore sconosciuto"),
        "danger",
      );
      progressWrap.style.display = "none";
      document.getElementById("uploadZone").style.display = "block";
      return;
    }

    showToast(
      `✅ ${data.totalFiles || 0} file caricati con successo!`,
      "success",
    );
    clearSelection();
    loadFiles(window.currentPath);
  } catch (error) {
    clearInterval(fakeInterval);
    window.isUploading = false;
    console.error("Errore upload:", error);
    showToast("Errore durante il caricamento", "danger");
    progressWrap.style.display = "none";
    document.getElementById("uploadZone").style.display = "block";
  }
}

function clearSelection() {
  window.selectedFiles = [];
  document.getElementById("fileInput").value = "";
  document.getElementById("folderInput").value = "";
  document.getElementById("selectedFiles").style.display = "none";
  document.getElementById("uploadProgress").style.display = "none";
  document.getElementById("filesList").innerHTML = "";
  document.getElementById("uploadZone").style.display = "block";
}
