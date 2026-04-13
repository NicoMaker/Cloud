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
      if (!window.mainFolderNames.includes(folder)) {
        window.mainFolderNames.push(folder);
      }
    }
  });
  window.selectedFiles = files;
  displaySelectedFiles();
  document.getElementById("fileInput").value = "";
}

function displaySelectedFiles() {
  const container = document.getElementById("selectedFiles");
  const filesList = document.getElementById("filesList");

  if (!window.selectedFiles.length) {
    container.style.display = "none";
    return;
  }

  let rootFolder = "";
  if (
    window.selectedFiles[0].webkitRelativePath &&
    window.selectedFiles[0].webkitRelativePath.includes("/")
  ) {
    rootFolder = window.selectedFiles[0].webkitRelativePath.split("/")[0];
  }

  // Costruisce albero per anteprima
  const tree = {};
  window.selectedFiles.forEach((file) => {
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
    let html = `<ul style="margin-left:${level * 20}px">`;
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
  if (!window.selectedFiles.length) {
    showToast("Seleziona file o cartelle prima di caricare", "warning");
    return;
  }
  if (window.isUploading) {
    showToast("Caricamento già in corso", "warning");
    return;
  }
  window.isUploading = true;

  const formData = new FormData();
  const allFolders = new Set();
  const relativePaths = [];

  window.selectedFiles.forEach((file) => {
    let relPath = file.webkitRelativePath || file.name;
    if (window.currentPath) {
      relPath = window.currentPath + "/" + relPath;
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
    window.isUploading = false;

    if (!response.ok || !data.success) {
      showToast(
        "Errore durante il caricamento: " + (data.message || data.error || "Errore sconosciuto"),
        "danger",
      );
      return;
    }
    showToast(`✅ ${data.totalFiles || 0} file caricati con successo!`, "success");
    clearSelection();
    loadFiles(window.currentPath);
  } catch (error) {
    console.error("Errore upload:", error);
    showToast("Errore durante il caricamento dei file", "danger");
    window.isUploading = false;
  }
}

function clearSelection() {
  window.selectedFiles = [];
  document.getElementById("fileInput").value = "";
  document.getElementById("folderInput").value = "";
  document.getElementById("selectedFiles").style.display = "none";
  document.getElementById("filesList").innerHTML = "";
}
