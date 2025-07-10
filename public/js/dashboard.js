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
    console.log("File selezionati:", files.length)

    selectedFiles = files
    displaySelectedFiles()

    // Pulisci l'altro input
    document.getElementById("folderInput").value = ""
}

function handleFolderSelection(e) {
    const files = Array.from(e.target.files)
    console.log("File cartella selezionati:", files.length)

    // Mostra la struttura che verrà creata
    console.log("=== STRUTTURA CARTELLA SELEZIONATA ===")
    const folderStructure = new Set()

    files.forEach((file) => {
        const path = file.webkitRelativePath || file.name
        console.log(`File: ${path}`)

        if (path.includes("/")) {
            const dirPath = path.substring(0, path.lastIndexOf("/"))
            folderStructure.add(dirPath)

            // Aggiungi anche tutte le cartelle padre
            const parts = dirPath.split("/")
            let currentPath = ""
            parts.forEach((part) => {
                currentPath += (currentPath ? "/" : "") + part
                folderStructure.add(currentPath)
            })
        }
    })

    console.log("Cartelle che verranno create:")
    Array.from(folderStructure)
        .sort()
        .forEach((folder) => {
            console.log(`  📁 ${folder}`)
        })

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

    // Analizza la struttura delle cartelle
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

    // Mostra struttura delle cartelle
    if (folderStructure.size > 0) {
        const structureDiv = document.createElement("div")
        structureDiv.className = "folder-structure mb-3"
        structureDiv.innerHTML = `
      <h6 class="text-primary">
        <i class="fas fa-sitemap me-2"></i>Struttura Cartelle da Creare
      </h6>
    `

        // Ordina le cartelle per percorso
        const sortedFolders = Array.from(folderStructure.keys()).sort()

        sortedFolders.forEach((folderPath) => {
            const files = folderStructure.get(folderPath)
            const folderDiv = document.createElement("div")
            folderDiv.className = "folder-preview mb-2"

            // Calcola il livello di indentazione
            const level = folderPath.split("/").length - 1

            folderDiv.innerHTML = `
        <div class="folder-header bg-light p-2 rounded">
          <strong style="margin-left: ${level * 20}px;">
            <i class="fas fa-folder text-warning me-1"></i>
            ${folderPath}
          </strong>
          <small class="text-muted ms-2">(${files.length} file)</small>
        </div>
        <div class="folder-files ms-4">
          ${files
                    .map(
                        (f) => `
            <div class="file-preview small text-muted">
              <i class="fas fa-file me-1"></i>${f.name}
              <span class="text-muted">(${formatFileSize(f.file.size)})</span>
            </div>
          `,
                    )
                    .join("")}
        </div>
      `

            structureDiv.appendChild(folderDiv)
        })

        filesList.appendChild(structureDiv)
    }

    // Mostra file nella radice se presenti
    if (rootFiles.length > 0) {
        const rootDiv = document.createElement("div")
        rootDiv.className = "root-files mb-2"
        rootDiv.innerHTML = `
      <div class="folder-header bg-light p-2 rounded">
        <strong>
          <i class="fas fa-home text-primary me-1"></i>
          File Radice
        </strong>
        <small class="text-muted ms-2">(${rootFiles.length} file)</small>
      </div>
      <div class="folder-files ms-3">
        ${rootFiles
                .map(
                    (f) => `
          <div class="file-preview small">
            <i class="fas fa-file me-1"></i>${f.name}
            <span class="text-muted">(${formatFileSize(f.file.size)})</span>
          </div>
        `,
                )
                .join("")}
      </div>
    `
        filesList.appendChild(rootDiv)
    }

    // Mostra riepilogo
    const summary = document.createElement("div")
    summary.className = "upload-summary mt-3 p-3 bg-primary text-white rounded"
    summary.innerHTML = `
    <div class="row">
      <div class="col-md-6">
        <strong><i class="fas fa-files me-1"></i>Totale File: ${selectedFiles.length}</strong>
        <br><small>Dimensione: ${formatFileSize(selectedFiles.reduce((total, file) => total + file.size, 0))}</small>
      </div>
      <div class="col-md-6">
        <strong><i class="fas fa-folder me-1"></i>Cartelle: ${folderStructure.size}</strong>
        <br><small>Struttura completa verrà ricreata</small>
      </div>
    </div>
  `
    filesList.appendChild(summary)
}

function clearSelection() {
    selectedFiles = []
    document.getElementById("fileInput").value = ""
    document.getElementById("folderInput").value = ""
    document.getElementById("selectedFiles").style.display = "none"
}

// Processo di Caricamento
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

    console.log("=== INIZIO CARICAMENTO ===")
    console.log("File da caricare:", selectedFiles.length)

    isUploading = true
    const formData = new FormData()

    // Aggiungi tutti i file al FormData mantenendo la struttura
    selectedFiles.forEach((file, index) => {
        const fileName = file.webkitRelativePath || file.name
        console.log(`Preparazione file ${index + 1}: ${fileName}`)

        const fileToUpload = new File([file], fileName, {
            type: file.type,
            lastModified: file.lastModified,
        })

        if (file.webkitRelativePath) {
            Object.defineProperty(fileToUpload, "webkitRelativePath", {
                value: file.webkitRelativePath,
                writable: false,
            })
        }

        formData.append("files", fileToUpload)
    })

    // Mostra progresso
    document.getElementById("uploadProgress").style.display = "block"
    document.getElementById("selectedFiles").style.display = "none"

    console.log("📤 Invio richiesta caricamento...")

    try {
        const response = await fetch("/upload", {
            method: "POST",
            body: formData,
            headers: {
                Accept: "application/json",
            },
            credentials: "same-origin", // Importante per mantenere i cookie di sessione
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
        console.log("✅ Risposta caricamento:", data)

        if (data.success) {
            let message = data.message
            if (data.foldersCreated > 0) {
                message += ` Struttura di ${data.foldersCreated} cartelle creata.`
            }
            showToast(message, "success")
            clearSelection()

            // Mostra dettagli nel console
            if (data.folderStructure && data.folderStructure.length > 0) {
                console.log("📁 Cartelle create:")
                data.folderStructure.forEach((folder) => {
                    console.log(`  📂 ${folder}`)
                })
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

function updateUploadProgress(data) {
    const progressBar = document.getElementById("progressBar")
    const progressText = document.getElementById("progressText")

    progressBar.style.width = `${data.percentage}%`
    progressText.textContent = `${data.processed}/${data.total} file (${data.percentage}%)`
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

function expandAll() {
    // Funzione per espandere tutte le cartelle (implementazione futura)
    showToast("Funzione in sviluppo", "info")
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
