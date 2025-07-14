// Variabili globali
let currentPath = ""
let selectedFiles = []
let socket
let userRole = "user"
let isUploading = false
const io = window.io
const bootstrap = window.bootstrap

// Inizializza l'applicazione
document.addEventListener("DOMContentLoaded", () => {
  initializeApp()
  setupEventListeners()
  setupSocketConnection()
})

// Funzione per verificare sessione
async function checkSession() {
  try {
    const response = await fetch("/api/session-check")
    const data = await response.json()

    if (!data.valid) {
      console.log("❌ Sessione non valida, reindirizzamento al login")
      showToast("Sessione scaduta. Reindirizzamento al login...", "warning")
      setTimeout(() => {
        window.location.href = "/login.html?error=session_expired"
      }, 2000)
      return false
    }

    return true
  } catch (error) {
    console.error("Errore controllo sessione:", error)
    return false
  }
}

function initializeApp() {
  // Carica info sessione utente
  fetch("/session-info")
    .then((res) => {
      if (res.status === 401) {
        window.location.href = "/login.html?error=session_expired"
        return
      }
      return res.json()
    })
    .then((data) => {
      if (!data) return

      userRole = data.role
      document.getElementById("userInfo").innerHTML = `<i class="fas fa-user me-1"></i>${data.username} (${data.role})`

      if (data.role === "admin") {
        document.getElementById("adminBtn").style.display = "inline-block"
        document.getElementById("deleteAllBtn").style.display = "inline-block"
      }
    })
    .catch((err) => {
      console.error("Errore nel caricamento info sessione:", err)
      showToast("Errore di autenticazione. Reindirizzamento al login...", "error")
      setTimeout(() => {
        window.location.href = "/login.html?error=auth_error"
      }, 2000)
    })

  // Carica lista file iniziale
  loadFiles("")

  // Controllo sessione periodico ogni 5 minuti
  setInterval(
    async () => {
      const valid = await checkSession()
      if (!valid) {
        console.log("⏰ Controllo periodico: sessione scaduta")
      }
    },
    5 * 60 * 1000,
  ) // 5 minuti
}

function setupEventListeners() {
  const fileInput = document.getElementById("fileInput")
  const folderInput = document.getElementById("folderInput")
  const confirmText = document.getElementById("confirmText")

  // Eventi input file
  fileInput.addEventListener("change", handleFileSelection)
  folderInput.addEventListener("change", handleFolderSelection)

  // Controllo testo conferma eliminazione
  if (confirmText) {
    confirmText.addEventListener("input", (e) => {
      const confirmBtn = document.getElementById("confirmDeleteAll")
      confirmBtn.disabled = e.target.value !== "ELIMINA TUTTO"
    })
  }
}

function setupSocketConnection() {
  socket = io()

  socket.on("uploadProgress", (data) => {
    updateUploadProgress(data)
  })

  socket.on("connect", () => {
    console.log("Connesso al server per aggiornamenti in tempo reale")
  })
}

// Funzioni Selezione File
function selectFiles() {
  document.getElementById("fileInput").click()
}

function selectFolder() {
  document.getElementById("folderInput").click()
}

function handleFileSelection(e) {
  const files = Array.from(e.target.files)
  console.log("=== SELEZIONE FILE INDIVIDUALI ===")
  console.log(`📄 File selezionati: ${files.length}`)

  files.forEach((file, index) => {
    console.log(`${index + 1}. ${file.name} (${formatFileSize(file.size)})`)
  })

  selectedFiles = files
  displaySelectedFiles()

  // Pulisci l'altro input
  document.getElementById("folderInput").value = ""
}

function handleFolderSelection(e) {
  const files = Array.from(e.target.files)
  console.log("=== SELEZIONE CARTELLA COMPLETA ===")
  console.log(`📁 File nella cartella: ${files.length}`)

  // Analizza la struttura della cartella selezionata
  const folderStructure = new Map()
  const rootFiles = []

  console.log("\n📋 ANALISI DETTAGLIATA STRUTTURA CARTELLA:")
  files.forEach((file, index) => {
    const path = file.webkitRelativePath || file.name
    console.log(`${index + 1}. "${path}" (${formatFileSize(file.size)})`)
    console.log(`   webkitRelativePath: "${file.webkitRelativePath || 'NON DISPONIBILE'}"`)
    console.log(`   name: "${file.name}"`)

    if (path.includes("/")) {
      const dirPath = path.substring(0, path.lastIndexOf("/"))
      const fileName = path.substring(path.lastIndexOf("/") + 1)

      console.log(`   📂 Directory: "${dirPath}"`)
      console.log(`   📄 Nome file: "${fileName}"`)

      if (!folderStructure.has(dirPath)) {
        folderStructure.set(dirPath, [])
      }
      folderStructure.get(dirPath).push(fileName)

      // Aggiungi anche tutte le cartelle padre
      const parts = dirPath.split("/")
      let currentPath = ""
      parts.forEach((part) => {
        currentPath += (currentPath ? "/" : "") + part
        if (!folderStructure.has(currentPath)) {
          folderStructure.set(currentPath, [])
        }
      })
    } else {
      console.log(`   📄 File nella ROOT: "${path}"`)
      rootFiles.push(path)
    }
  })

  console.log("\n🌳 STRUTTURA CARTELLE CHE VERRANNO RICREATE:")
  console.log("📁 ROOT")
  rootFiles.forEach((file) => {
    console.log(`   📄 ${file}`)
  })

  Array.from(folderStructure.keys())
    .sort()
    .forEach((folder) => {
      const depth = folder.split("/").length
      const indent = "  ".repeat(depth + 1)
      const folderName = folder.split("/").pop()
      const parentIndent = "  ".repeat(depth)

      console.log(`${parentIndent}📁 ${folderName}/`)
      const filesInFolder = folderStructure.get(folder)
      if (filesInFolder && filesInFolder.length > 0) {
        filesInFolder.forEach((file) => {
          console.log(`${indent}📄 ${file}`)
        })
      }
    })

  console.log(`\n📊 RIEPILOGO:`)
  console.log(`   📁 Cartelle totali: ${folderStructure.size}`)
  console.log(`   📄 File nella root: ${rootFiles.length}`)
  console.log(`   📄 File totali: ${files.length}`)

  selectedFiles = files
  displaySelectedFiles()

  // Pulisci l'altro input
  document.getElementById("fileInput").value = ""
}

function displaySelectedFiles() {
  const container = document.getElementById("selectedFiles")
  const filesList = document.getElementById("filesList")

  if (selectedFiles.length === 0) {
    container.style.display = "none"
    return
  }

  container.style.display = "block"
  filesList.innerHTML = ""

  // Analizza la struttura delle cartelle per la visualizzazione
  const folderStructure = new Map()
  const rootFiles = []

  selectedFiles.forEach((file, index) => {
    const path = file.webkitRelativePath || file.name

    if (path.includes("/")) {
      // File in una cartella
      const dirPath = path.substring(0, path.lastIndexOf("/"))
      const fileName = path.substring(path.lastIndexOf("/") + 1)

      if (!folderStructure.has(dirPath)) {
        folderStructure.set(dirPath, [])
      }

      folderStructure.get(dirPath).push({
        file: file,
        name: fileName,
        fullPath: path,
        index: index,
      })
    } else {
      // File nella radice
      rootFiles.push({
        file: file,
        name: path,
        fullPath: path,
        index: index,
      })
    }
  })

  // Mostra struttura delle cartelle con preview dettagliata
  if (folderStructure.size > 0) {
    const structureDiv = document.createElement("div")
    structureDiv.className = "folder-structure mb-3"
    structureDiv.innerHTML = `
      <h6 class="text-primary">
        <i class="fas fa-sitemap me-2"></i>Struttura File System da Ricreare
      </h6>
      <div class="alert alert-info">
        <i class="fas fa-info-circle me-2"></i>
        <strong>Sistema Avanzato:</strong> La struttura originale verrà ricreata esattamente come nel file system, 
        mantenendo tutte le cartelle, sottocartelle e file nelle posizioni corrette.
      </div>
    `

    // Ordina le cartelle per percorso per mostrare la gerarchia
    const sortedFolders = Array.from(folderStructure.keys()).sort()

    sortedFolders.forEach((folderPath) => {
      const files = folderStructure.get(folderPath)
      const folderDiv = document.createElement("div")
      folderDiv.className = "folder-preview mb-3 border rounded"

      // Calcola il livello di indentazione per la visualizzazione gerarchica
      const level = folderPath.split("/").length - 1
      const indentClass = level > 0 ? `ms-${Math.min(level * 2, 5)}` : ""

      folderDiv.innerHTML = `
        <div class="folder-header bg-light p-3 rounded-top ${indentClass}">
          <div class="d-flex align-items-center">
            <i class="fas fa-folder text-warning me-2"></i>
            <strong class="text-primary">${folderPath}</strong>
            <span class="badge bg-secondary ms-2">${files.length} file</span>
          </div>
          <small class="text-muted">Profondità: ${folderPath.split("/").length} livelli</small>
        </div>
        <div class="folder-files p-2 bg-white rounded-bottom">
          ${files
          .slice(0, 5) // Mostra solo i primi 5 file per non appesantire l'interfaccia
          .map(
            (f) => `
            <div class="file-preview d-flex align-items-center py-1">
              <i class="fas fa-file text-muted me-2"></i>
              <span class="flex-grow-1">${f.name}</span>
              <small class="text-muted">${formatFileSize(f.file.size)}</small>
            </div>
          `,
          )
          .join("")}
          ${files.length > 5 ? `<div class="text-muted small mt-1">... e altri ${files.length - 5} file</div>` : ""}
        </div>
      `

      structureDiv.appendChild(folderDiv)
    })

    filesList.appendChild(structureDiv)
  }

  // Mostra file nella radice se presenti
  if (rootFiles.length > 0) {
    const rootDiv = document.createElement("div")
    rootDiv.className = "root-files mb-3 border rounded"
    rootDiv.innerHTML = `
      <div class="folder-header bg-light p-3 rounded-top">
        <div class="d-flex align-items-center">
          <i class="fas fa-home text-primary me-2"></i>
          <strong class="text-primary">File Radice</strong>
          <span class="badge bg-secondary ms-2">${rootFiles.length} file</span>
        </div>
        <small class="text-muted">File che verranno posizionati nella directory principale</small>
      </div>
      <div class="folder-files p-2 bg-white rounded-bottom">
        ${rootFiles
        .slice(0, 10)
        .map(
          (f) => `
          <div class="file-preview d-flex align-items-center py-1">
            <i class="fas fa-file text-muted me-2"></i>
            <span class="flex-grow-1">${f.name}</span>
            <small class="text-muted">${formatFileSize(f.file.size)}</small>
          </div>
        `,
        )
        .join("")}
        ${rootFiles.length > 10 ? `<div class="text-muted small mt-1">... e altri ${rootFiles.length - 10} file</div>` : ""}
      </div>
    `
    filesList.appendChild(rootDiv)
  }

  // Mostra riepilogo dettagliato
  const totalSize = selectedFiles.reduce((total, file) => total + file.size, 0)
  const summary = document.createElement("div")
  summary.className = "upload-summary mt-3 p-4 bg-gradient text-white rounded"
  summary.innerHTML = `
    <div class="row">
      <div class="col-md-4">
        <div class="text-center">
          <h5 class="mb-1"><i class="fas fa-files me-2"></i>${selectedFiles.length}</h5>
          <small>File Totali</small>
        </div>
      </div>
      <div class="col-md-4">
        <div class="text-center">
          <h5 class="mb-1"><i class="fas fa-folder me-2"></i>${folderStructure.size}</h5>
          <small>Cartelle da Creare</small>
        </div>
      </div>
      <div class="col-md-4">
        <div class="text-center">
          <h5 class="mb-1"><i class="fas fa-weight me-2"></i>${formatFileSize(totalSize)}</h5>
          <small>Dimensione Totale</small>
        </div>
      </div>
    </div>
    <hr class="my-3">
    <div class="text-center">
      <small>
        <i class="fas fa-magic me-1"></i>
        <strong>Sistema Intelligente:</strong> Struttura file system ricreata automaticamente con precisione assoluta
      </small>
    </div>
  `
  filesList.appendChild(summary)
}

function clearSelection() {
  selectedFiles = []
  document.getElementById("fileInput").value = ""
  document.getElementById("folderInput").value = ""
  document.getElementById("selectedFiles").style.display = "none"
  console.log("🧹 Selezione file cancellata")
}

// Processo di Caricamento Avanzato
async function startUpload() {
  if (selectedFiles.length === 0) {
    showToast("Seleziona file da caricare", "warning")
    return
  }

  if (isUploading) {
    showToast("Caricamento già in corso", "warning")
    return
  }

  // Controlla sessione prima dell'upload
  console.log("🔍 Controllo sessione prima dell'upload...")
  const sessionValid = await checkSession()
  if (!sessionValid) {
    return
  }

  console.log("=== INIZIO CARICAMENTO AVANZATO ===")
  console.log(`📄 File da caricare: ${selectedFiles.length}`)

  // Analizza pre-upload per logging
  const preUploadAnalysis = analyzeFileStructure(selectedFiles)
  console.log("📊 ANALISI PRE-UPLOAD:")
  console.log(`   📁 Cartelle da creare: ${preUploadAnalysis.foldersToCreate}`)
  console.log(`   📄 File nella root: ${preUploadAnalysis.rootFiles}`)
  console.log(`   📊 Profondità massima: ${preUploadAnalysis.maxDepth}`)

  isUploading = true
  const formData = new FormData()

  // Aggiungi tutti i file al FormData mantenendo la struttura perfetta
  selectedFiles.forEach((file, index) => {
    const fileName = file.webkitRelativePath || file.name
    console.log(`📤 Preparazione file ${index + 1}: "${fileName}"`)

    // Crea un nuovo file mantenendo tutte le proprietà originali
    const fileToUpload = new File([file], fileName, {
      type: file.type,
      lastModified: file.lastModified,
    })

    // Mantieni webkitRelativePath se presente
    if (file.webkitRelativePath) {
      Object.defineProperty(fileToUpload, "webkitRelativePath", {
        value: file.webkitRelativePath,
        writable: false,
        enumerable: true,
        configurable: false,
      })
      console.log(`   🗂️ Struttura mantenuta: "${file.webkitRelativePath}"`)
    }

    formData.append("files", fileToUpload)
  })

  // Mostra progresso
  document.getElementById("uploadProgress").style.display = "block"
  document.getElementById("selectedFiles").style.display = "none"

  console.log("📤 Invio richiesta caricamento con struttura file system...")

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    })

    console.log("📥 Stato risposta:", response.status)
    console.log("📥 Content-Type:", response.headers.get("content-type"))

    if (response.status === 401) {
      showToast("Sessione scaduta. Reindirizzamento al login...", "error")
      setTimeout(() => {
        window.location.href = "/login.html?error=session_expired"
      }, 2000)
      return
    }

    if (!response.ok) {
      throw new Error(`Errore HTTP! stato: ${response.status}`)
    }

    const data = await response.json()
    console.log("✅ RISPOSTA CARICAMENTO COMPLETA:", data)

    if (data.success) {
      let message = `${data.successful} file caricati con successo!`

      if (data.foldersCreated > 0) {
        message += ` Struttura file system ricreata perfettamente: ${data.foldersCreated} cartelle`

        if (data.structureDetails) {
          const details = data.structureDetails
          message += ` (profondità ${details.maxDepth} livelli)`

          if (details.rootFiles > 0) {
            message += `, ${details.rootFiles} file nella root`
          }
        }
      }

      showToast(message, "success")
      clearSelection()

      // Mostra dettagli struttura nel console per debug
      if (data.fileSystemStructure && data.fileSystemStructure.directories) {
        console.log("🌳 STRUTTURA FILE SYSTEM RICREATA PERFETTAMENTE:")
        console.log("📁 ROOT")

        // File nella root
        if (data.structureDetails.fileDistribution.ROOT) {
          data.structureDetails.fileDistribution.ROOT.forEach((fileInfo) => {
            console.log(`   📄 ${fileInfo.filename}`)
          })
        }

        // Struttura directory
        data.fileSystemStructure.directories.forEach((dir) => {
          const level = dir.split("/").length
          const indent = "  ".repeat(level + 1)
          const dirName = dir.split("/").pop()
          const parentIndent = "  ".repeat(level)

          console.log(`${parentIndent}📁 ${dirName}/`)

          const filesInDir = data.structureDetails.fileDistribution[dir] || []
          filesInDir.forEach((fileInfo) => {
            console.log(`${indent}📄 ${fileInfo.filename}`)
          })
        })

        console.log(`\n📊 STATISTICHE FINALI:`)
        console.log(`   📁 Directory create: ${data.structureDetails.totalDirectories}`)
        console.log(`   📄 File processati: ${data.structureDetails.totalFiles}`)
        console.log(`   📊 Profondità: ${data.structureDetails.maxDepth}`)
        console.log(`   🎯 Posizionamento perfetto: ${data.uploadQuality?.perfectPlacement ? "SÌ" : "NO"}`)
      }

      // Aggiorna immediatamente la lista file
      loadFilesAndScrollToNew(currentPath)
    } else {
      showToast("Caricamento fallito: " + (data.error || data.message || "Errore sconosciuto"), "error")
      console.error("❌ Caricamento fallito:", data)
    }
  } catch (err) {
    console.error("❌ Errore caricamento:", err)

    if (err.message.includes("401")) {
      showToast("Sessione scaduta. Effettua nuovamente il login.", "error")
      setTimeout(() => {
        window.location.href = "/login.html?error=session_expired"
      }, 2000)
    } else {
      showToast("Caricamento fallito: " + err.message, "error")
    }
  } finally {
    isUploading = false
    document.getElementById("uploadProgress").style.display = "none"
    if (selectedFiles.length > 0) {
      document.getElementById("selectedFiles").style.display = "block"
    }
  }
}

// Funzione helper per analizzare la struttura dei file
function analyzeFileStructure(files) {
  const folders = new Set()
  let rootFiles = 0
  let maxDepth = 0

  files.forEach((file) => {
    const path = file.webkitRelativePath || file.name

    if (path.includes("/")) {
      const dirPath = path.substring(0, path.lastIndexOf("/"))
      const depth = dirPath.split("/").length
      maxDepth = Math.max(maxDepth, depth)

      // Aggiungi tutte le directory nel percorso
      const parts = dirPath.split("/")
      let currentPath = ""
      parts.forEach((part) => {
        currentPath += (currentPath ? "/" : "") + part
        folders.add(currentPath)
      })
    } else {
      rootFiles++
    }
  })

  return {
    foldersToCreate: folders.size,
    rootFiles: rootFiles,
    maxDepth: maxDepth,
    folderList: Array.from(folders).sort(),
  }
}

function updateUploadProgress(data) {
  const progressBar = document.getElementById("progressBar")
  const progressText = document.getElementById("progressText")

  progressBar.style.width = `${data.percentage}%`
  progressText.textContent = `${data.processed}/${data.total} file (${data.percentage}%)`

  // Mostra informazioni dettagliate sul file corrente
  if (data.currentFolder && data.currentPath) {
    const currentFileInfo = document.createElement("div")
    currentFileInfo.className = "current-file-info mt-2 small text-muted"
    currentFileInfo.innerHTML = `
      <i class="fas fa-upload me-1"></i>
      <strong>${data.currentFile}</strong> → 
      <i class="fas fa-folder me-1"></i>${data.currentFolder}
    `

    // Sostituisci le info precedenti
    const existingInfo = document.querySelector(".current-file-info")
    if (existingInfo) {
      existingInfo.replaceWith(currentFileInfo)
    } else {
      document.getElementById("uploadProgress").appendChild(currentFileInfo)
    }
  }
}

// Funzioni Browser File
function loadFiles(folderPath) {
  currentPath = folderPath
  updateBreadcrumb(folderPath)

  const fileList = document.getElementById("fileList")
  fileList.innerHTML =
    '<tr><td colspan="4" class="text-center py-4"><i class="fas fa-spinner fa-spin me-2"></i>Caricamento...</td></tr>'

  fetch(`/api/files?folder=${encodeURIComponent(folderPath)}`)
    .then((res) => res.json())
    .then((files) => {
      displayFiles(files, folderPath)
    })
    .catch((err) => {
      console.error("Errore nel caricamento file:", err)
      fileList.innerHTML =
        '<tr><td colspan="4" class="text-center text-danger py-4">Errore nel caricamento file</td></tr>'
    })
}

function loadFilesAndScrollToNew(folderPath) {
  const oldFileCount = document.getElementById("fileList").children.length

  loadFiles(folderPath)

  // Scorri verso il basso dopo un breve ritardo per permettere il rendering
  setTimeout(() => {
    const newRows = document.getElementById("fileList").children

    if (newRows.length > oldFileCount) {
      // Scorri verso gli ultimi file aggiunti
      const lastRow = newRows[newRows.length - 1]
      if (lastRow) {
        lastRow.scrollIntoView({ behavior: "smooth", block: "center" })
        // Evidenzia brevemente i nuovi file
        for (let i = oldFileCount; i < newRows.length; i++) {
          if (newRows[i]) {
            newRows[i].classList.add("new-file-highlight")
            setTimeout(() => {
              newRows[i].classList.remove("new-file-highlight")
            }, 3000)
          }
        }
      }
    }
  }, 500)
}

function displayFiles(files, folderPath) {
  const fileList = document.getElementById("fileList")
  fileList.innerHTML = ""

  // Aggiungi link directory padre se non alla radice
  if (folderPath !== "") {
    const parentPath = folderPath.split("/").slice(0, -1).join("/")
    const row = document.createElement("tr")
    row.className = "fade-in"
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
    `
    fileList.appendChild(row)
  }

  if (files.length === 0 && folderPath === "") {
    const row = document.createElement("tr")
    row.innerHTML = `
      <td colspan="4" class="text-center text-muted py-5">
          <i class="fas fa-folder-open fa-3x mb-3 text-muted"></i>
          <br><strong>Nessun file caricato</strong>
          <br><small>Inizia caricando alcuni file o cartelle!</small>
          <br><small class="text-primary">Il sistema ricreerà automaticamente la struttura originale</small>
      </td>
    `
    fileList.appendChild(row)
    return
  }

  // Ordina: cartelle prima, poi file alfabeticamente
  files.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1
    return a.name.localeCompare(b.name, "it", { numeric: true })
  })

  files.forEach((file, index) => {
    const row = document.createElement("tr")
    row.className = "fade-in file-row"
    row.setAttribute("data-file-type", file.type)
    row.setAttribute("data-file-name", file.name.toLowerCase())

    const icon = getFileIcon(file)
    const size = file.type === "folder" ? "-" : formatFileSize(file.size)
    const modified = new Date(file.modified).toLocaleDateString("it-IT")

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
      <td class="file-actions">
          ${file.type === "file"
        ? `<a href="/download/${file.path}" class="btn btn-outline-primary btn-sm me-1" title="Scarica">
                   <i class="fas fa-download"></i>
                 </a>`
        : ""
      }
          ${userRole === "admin"
        ? `<button onclick="deleteItem('${file.path}', '${file.name}')" class="btn btn-outline-danger btn-sm" title="Elimina">
                   <i class="fas fa-trash"></i>
                 </button>`
        : ""
      }
      </td>
    `
    fileList.appendChild(row)
  })
}

function refreshFiles() {
  loadFiles(currentPath)
  showToast("File aggiornati", "info")
}

function deleteItem(path, name) {
  if (!confirm(`Sei sicuro di voler eliminare "${name}"?`)) return

  fetch(`/api/delete/${path}`, {
    method: "DELETE",
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        showToast(`"${name}" eliminato con successo`, "success")
        loadFiles(currentPath)
      } else {
        showToast("Eliminazione fallita: " + (data.message || data.error), "error")
      }
    })
    .catch((err) => {
      console.error("Eliminazione fallita:", err)
      showToast("Eliminazione fallita", "error")
    })
}

// Funzione Elimina Tutto
async function confirmDeleteAll() {
  const confirmText = document.getElementById("confirmText").value

  if (confirmText !== "ELIMINA TUTTO") {
    showToast("Testo di conferma non corretto", "error")
    return
  }

  // Controlla sessione e permessi
  const sessionValid = await checkSession()
  if (!sessionValid) {
    return
  }

  if (userRole !== "admin") {
    showToast("Solo gli amministratori possono eliminare tutti i file", "error")
    return
  }

  try {
    const response = await fetch("/api/delete-all", {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
    })

    if (response.status === 401) {
      showToast("Sessione scaduta. Reindirizzamento al login...", "error")
      setTimeout(() => {
        window.location.href = "/login.html?error=session_expired"
      }, 2000)
      return
    }

    if (response.status === 403) {
      showToast("Accesso negato. Solo gli amministratori possono eliminare tutti i file.", "error")
      return
    }

    const data = await response.json()

    if (data.success) {
      showToast(data.message, "success")
      loadFiles("")

      // Chiudi modal e resetta form
      const modal = bootstrap.Modal.getInstance(document.getElementById("deleteAllModal"))
      modal.hide()
      document.getElementById("confirmText").value = ""
      document.getElementById("confirmDeleteAll").disabled = true
    } else {
      showToast("Eliminazione fallita: " + (data.message || data.error), "error")
    }
  } catch (err) {
    console.error("Errore eliminazione totale:", err)
    showToast("Errore durante l'eliminazione", "error")
  }
}

function deleteAllFiles() {
  const modal = new bootstrap.Modal(document.getElementById("deleteAllModal"))
  modal.show()
}

// Funzioni Utilità
function updateBreadcrumb(path) {
  const breadcrumb = document.getElementById("breadcrumb")
  breadcrumb.innerHTML =
    '<li class="breadcrumb-item"><a href="#" onclick="loadFiles(\'\')"><i class="fas fa-home me-1"></i>Home</a></li>'

  if (path) {
    const parts = path.split("/")
    let currentPath = ""

    parts.forEach((part, index) => {
      currentPath += (index > 0 ? "/" : "") + part
      const isLast = index === parts.length - 1

      const li = document.createElement("li")
      li.className = `breadcrumb-item ${isLast ? "active" : ""}`

      if (isLast) {
        li.innerHTML = `<span class="text-muted">${part}</span>`
      } else {
        li.innerHTML = `<a href="#" onclick="loadFiles('${currentPath}')">${part}</a>`
      }

      breadcrumb.appendChild(li)
    })
  }
}

function getFileIcon(file) {
  if (file.type === "folder") {
    return "fas fa-folder text-warning"
  }

  const ext = file.name.split(".").pop().toLowerCase()

  if (["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"].includes(ext)) {
    return "fas fa-image text-success"
  } else if (["pdf", "doc", "docx", "txt", "rtf", "odt"].includes(ext)) {
    return "fas fa-file-alt text-primary"
  } else if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)) {
    return "fas fa-file-archive text-secondary"
  } else if (["mp4", "avi", "mkv", "mov", "wmv", "flv", "webm"].includes(ext)) {
    return "fas fa-file-video text-danger"
  } else if (["mp3", "wav", "flac", "aac", "ogg", "wma"].includes(ext)) {
    return "fas fa-file-audio text-info"
  } else if (["js", "html", "css", "php", "py", "java", "cpp", "c"].includes(ext)) {
    return "fas fa-file-code text-dark"
  } else {
    return "fas fa-file text-muted"
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Byte"

  const k = 1024
  const sizes = ["Byte", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toastContainer")
  const toastId = "toast-" + Date.now()

  const toastColors = {
    success: "text-bg-success",
    error: "text-bg-danger",
    warning: "text-bg-warning",
    info: "text-bg-info",
  }

  const toastIcons = {
    success: "fas fa-check-circle",
    error: "fas fa-exclamation-triangle",
    warning: "fas fa-exclamation-circle",
    info: "fas fa-info-circle",
  }

  const toastEl = document.createElement("div")
  toastEl.id = toastId
  toastEl.className = `toast ${toastColors[type] || toastColors.info}`
  toastEl.setAttribute("role", "alert")
  toastEl.innerHTML = `
    <div class="toast-header">
        <i class="${toastIcons[type] || toastIcons.info} me-2"></i>
        <strong class="me-auto">Gestore File</strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
    </div>
    <div class="toast-body">${message}</div>
  `

  toastContainer.appendChild(toastEl)

  const toast = new bootstrap.Toast(toastEl)
  toast.show()

  // Rimuovi elemento toast dopo che è nascosto
  toastEl.addEventListener("hidden.bs.toast", () => {
    toastEl.remove()
  })
}

function createNewFolder() {
  const input = document.getElementById("newFolderName")
  const folderName = input.value.trim()

  if (!folderName || folderName.includes("..")) {
    alert("Inserisci un nome valido per la cartella.")
    return
  }

  const fullPath = currentPath ? `${currentPath}/${folderName}` : folderName

  fetch("/api/create-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: fullPath })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        input.value = ""
        loadFiles(currentPath)
        showToast("Cartella creata con successo!", "success")
      } else {
        alert("Errore: " + (data.message || "Impossibile creare la cartella."))
      }
    })
    .catch(err => {
      console.error("Errore nella creazione:", err)
      alert("Errore durante la creazione della cartella.")
    })
}

function handleFolderSelection(e) {
  const files = Array.from(e.target.files);
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

  const folderStructure = new Map();
  const rootFiles = [];

  selectedFiles.forEach(file => {
    const path = file.webkitRelativePath || file.name;
    if (path.includes("/")) {
      const dirPath = path.substring(0, path.lastIndexOf("/"));
      if (!folderStructure.has(dirPath)) folderStructure.set(dirPath, []);
      folderStructure.get(dirPath).push(file.name);
    } else {
      rootFiles.push(file.name);
    }
  });

  filesList.innerHTML = `
    <ul class="list-group">
      ${rootFiles.map(f => `<li class="list-group-item">📄 ${f}</li>`).join("")}
      ${Array.from(folderStructure.entries()).map(([dir, files]) =>
        `<li class="list-group-item">
          📁 ${dir}
          <ul>${files.map(f => `<li>📄 ${f}</li>`).join("")}</ul>
        </li>`).join("")}
    </ul>
  `;
  container.style.display = "block";
}

async function startUpload() {
  if (!selectedFiles.length) {
    alert("Seleziona file o cartelle prima di caricare");
    return;
  }

  const formData = new FormData();
  selectedFiles.forEach(file => {
    const name = file.webkitRelativePath || file.name;
    const fileWithPath = new File([file], name, { type: file.type, lastModified: file.lastModified });
    Object.defineProperty(fileWithPath, "webkitRelativePath", {
      value: file.webkitRelativePath,
      enumerable: true
    });
    formData.append("files", fileWithPath);
  });

  const res = await fetch("/upload", {
    method: "POST",
    body: formData,
    credentials: "same-origin"
  });

  const result = await res.json();
  if (result.success) {
    alert("File caricati con successo!");
    loadFiles(""); // ricarica esploratore
  } else {
    alert("Errore nel caricamento: " + result.message);
  }
}
