// Global variables
let currentPath = ""
let selectedFiles = []
let socket
let userRole = "user"
let isUploading = false
const io = window.io // Declare the io variable
const bootstrap = window.bootstrap // Declare the bootstrap variable

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  initializeApp()
  setupEventListeners()
  setupSocketConnection()
})

function initializeApp() {
  // Load user session info
  fetch("/session-info")
    .then((res) => res.json())
    .then((data) => {
      userRole = data.role
      document.getElementById("userInfo").innerHTML = `<i class="fas fa-user me-1"></i>${data.username} (${data.role})`

      if (data.role === "admin") {
        document.getElementById("adminBtn").style.display = "inline-block"
      }
    })
    .catch((err) => console.error("Failed to load session info:", err))

  // Load initial file list
  loadFiles("")
}

function setupEventListeners() {
  const fileInput = document.getElementById("fileInput")
  const folderInput = document.getElementById("folderInput")

  // File input events
  fileInput.addEventListener("change", handleFileSelection)
  folderInput.addEventListener("change", handleFolderSelection)
}

function setupSocketConnection() {
  socket = io()

  socket.on("uploadProgress", (data) => {
    updateUploadProgress(data)
  })

  socket.on("connect", () => {
    console.log("Connected to server for real-time updates")
  })
}

// File Selection Functions
function selectFiles() {
  document.getElementById("fileInput").click()
}

function selectFolder() {
  document.getElementById("folderInput").click()
}

function handleFileSelection(e) {
  const files = Array.from(e.target.files)
  console.log("Files selected:", files.length)

  selectedFiles = files
  displaySelectedFiles()

  // Clear the other input
  document.getElementById("folderInput").value = ""
}

function handleFolderSelection(e) {
  const files = Array.from(e.target.files)
  console.log("Folder files selected:", files.length)

  selectedFiles = files
  displaySelectedFiles()

  // Clear the other input
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

  // Group files by folder for better display
  const filesByFolder = {}

  selectedFiles.forEach((file, index) => {
    const path = file.webkitRelativePath || file.name
    const folder = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : "Root"

    if (!filesByFolder[folder]) {
      filesByFolder[folder] = []
    }

    filesByFolder[folder].push({
      file: file,
      path: path,
      index: index,
    })
  })

  // Display files grouped by folder
  Object.keys(filesByFolder).forEach((folder) => {
    const folderDiv = document.createElement("div")
    folderDiv.className = "folder-group mb-2"

    const folderHeader = document.createElement("div")
    folderHeader.className = "folder-header"
    folderHeader.innerHTML = `
      <strong><i class="fas fa-folder me-1"></i>${folder}</strong>
      <small class="text-muted">(${filesByFolder[folder].length} files)</small>
    `

    const fileList = document.createElement("div")
    fileList.className = "file-list ms-3"

    filesByFolder[folder].forEach((item) => {
      const fileDiv = document.createElement("div")
      fileDiv.className = "file-item d-flex justify-content-between align-items-center py-1"
      fileDiv.innerHTML = `
        <span>
          <i class="fas fa-file me-1"></i>
          ${item.path.includes("/") ? item.path.substring(item.path.lastIndexOf("/") + 1) : item.path}
        </span>
        <small class="text-muted">${formatFileSize(item.file.size)}</small>
      `
      fileList.appendChild(fileDiv)
    })

    folderDiv.appendChild(folderHeader)
    folderDiv.appendChild(fileList)
    filesList.appendChild(folderDiv)
  })

  // Show summary
  const summary = document.createElement("div")
  summary.className = "upload-summary mt-2 p-2 bg-light rounded"
  summary.innerHTML = `
    <strong>Total: ${selectedFiles.length} files</strong>
    <small class="text-muted d-block">
      Size: ${formatFileSize(selectedFiles.reduce((total, file) => total + file.size, 0))}
    </small>
  `
  filesList.appendChild(summary)
}

function clearSelection() {
  selectedFiles = []
  document.getElementById("fileInput").value = ""
  document.getElementById("folderInput").value = ""
  document.getElementById("selectedFiles").style.display = "none"
}

// Upload Process
function startUpload() {
  if (selectedFiles.length === 0) {
    showToast("Please select files to upload", "warning")
    return
  }

  if (isUploading) {
    showToast("Upload already in progress", "warning")
    return
  }

  console.log("=== STARTING UPLOAD ===")
  console.log("Files to upload:", selectedFiles.length)

  isUploading = true
  const formData = new FormData()

  // Add all files to FormData with consistent field name
  selectedFiles.forEach((file, index) => {
    console.log(`Adding file ${index + 1}:`, {
      name: file.name,
      webkitRelativePath: file.webkitRelativePath,
      size: file.size,
      type: file.type,
    })

    // Use webkitRelativePath if available (for folders), otherwise use name
    const fileName = file.webkitRelativePath || file.name

    // Create a new file object with the correct name
    const fileToUpload = new File([file], fileName, {
      type: file.type,
      lastModified: file.lastModified,
    })

    // Use consistent field name 'files'
    formData.append("files", fileToUpload)
  })

  // Log FormData contents
  console.log("FormData entries:")
  for (const [key, value] of formData.entries()) {
    console.log(`${key}:`, value instanceof File ? `File: ${value.name} (${value.size} bytes)` : value)
  }

  // Show progress
  document.getElementById("uploadProgress").style.display = "block"
  document.getElementById("selectedFiles").style.display = "none"

  console.log("Sending upload request...")

  fetch("/upload", {
    method: "POST",
    body: formData,
  })
    .then((res) => {
      console.log("Upload response status:", res.status)
      console.log("Upload response headers:", Object.fromEntries(res.headers.entries()))

      // Get response text first to debug
      return res.text().then((text) => {
        console.log("Raw response:", text)

        // Check if response is JSON
        const contentType = res.headers.get("content-type")
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error(
            `Server returned non-JSON response. Content-Type: ${contentType}. Response: ${text.substring(0, 200)}...`,
          )
        }

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}. Response: ${text}`)
        }

        try {
          return JSON.parse(text)
        } catch (parseError) {
          throw new Error(
            `Failed to parse JSON response: ${parseError.message}. Response: ${text.substring(0, 200)}...`,
          )
        }
      })
    })
    .then((data) => {
      console.log("Upload response data:", data)
      if (data.success) {
        showToast(data.message, "success")
        clearSelection()
        loadFiles(currentPath) // Refresh file list
      } else {
        showToast("Upload failed: " + (data.error || data.message || "Unknown error"), "error")
        console.error("Upload failed with data:", data)
      }
    })
    .catch((err) => {
      console.error("Upload error:", err)
      showToast("Upload failed: " + err.message, "error")
    })
    .finally(() => {
      isUploading = false
      document.getElementById("uploadProgress").style.display = "none"
      if (selectedFiles.length > 0) {
        document.getElementById("selectedFiles").style.display = "block"
      }
    })
}

function updateUploadProgress(data) {
  const progressBar = document.getElementById("progressBar")
  const progressText = document.getElementById("progressText")

  progressBar.style.width = `${data.percentage}%`
  progressText.textContent = `${data.processed}/${data.total} files (${data.percentage}%)`
}

// File Browser Functions
function loadFiles(folderPath) {
  currentPath = folderPath
  updateBreadcrumb(folderPath)

  const fileList = document.getElementById("fileList")
  fileList.innerHTML =
    '<tr><td colspan="4" class="text-center"><i class="fas fa-spinner fa-spin me-2"></i>Loading...</td></tr>'

  fetch(`/api/files?folder=${encodeURIComponent(folderPath)}`)
    .then((res) => res.json())
    .then((files) => {
      fileList.innerHTML = ""

      // Add parent directory link if not at root
      if (folderPath !== "") {
        const parentPath = folderPath.split("/").slice(0, -1).join("/")
        const row = document.createElement("tr")
        row.className = "fade-in"
        row.innerHTML = `
                    <td>
                        <i class="fas fa-level-up-alt file-icon"></i>
                        <a href="#" onclick="loadFiles('${parentPath}')" class="text-decoration-none">
                            <strong>.. (Parent Directory)</strong>
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
                    <td colspan="4" class="text-center text-muted">
                        <i class="fas fa-folder-open fa-3x mb-3"></i>
                        <br>No files uploaded yet. Start by uploading some files!
                    </td>
                `
        fileList.appendChild(row)
        return
      }

      files.forEach((file) => {
        const row = document.createElement("tr")
        row.className = "fade-in"
        const icon = getFileIcon(file)
        const size = file.type === "folder" ? "-" : formatFileSize(file.size)
        const modified = new Date(file.modified).toLocaleDateString()

        row.innerHTML = `
                    <td>
                        <i class="${icon} file-icon"></i>
                        ${
                          file.type === "folder"
                            ? `<a href="#" onclick="loadFiles('${file.path}')" class="text-decoration-none"><strong>${file.name}</strong></a>`
                            : `<span>${file.name}</span>`
                        }
                    </td>
                    <td>${size}</td>
                    <td>${modified}</td>
                    <td class="file-actions">
                        ${
                          file.type === "file"
                            ? `<a href="/download/${file.path}" class="btn btn-outline-primary btn-sm me-1">
                                <i class="fas fa-download"></i>
                               </a>`
                            : ""
                        }
                        ${
                          userRole === "admin"
                            ? `<button onclick="deleteItem('${file.path}', '${file.name}')" class="btn btn-outline-danger btn-sm">
                                <i class="fas fa-trash"></i>
                               </button>`
                            : ""
                        }
                    </td>
                `
        fileList.appendChild(row)
      })
    })
    .catch((err) => {
      console.error("Failed to load files:", err)
      fileList.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Failed to load files</td></tr>'
    })
}

function refreshFiles() {
  loadFiles(currentPath)
  showToast("Files refreshed", "info")
}

function deleteItem(path, name) {
  if (!confirm(`Are you sure you want to delete "${name}"?`)) return

  fetch(`/api/delete/${path}`, {
    method: "DELETE",
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        showToast(`"${name}" deleted successfully`, "success")
        loadFiles(currentPath)
      } else {
        showToast("Delete failed", "error")
      }
    })
    .catch((err) => {
      console.error("Delete failed:", err)
      showToast("Delete failed", "error")
    })
}

// Utility Functions
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
        li.textContent = part
      } else {
        li.innerHTML = `<a href="#" onclick="loadFiles('${currentPath}')">${part}</a>`
      }

      breadcrumb.appendChild(li)
    })
  }
}

function getFileIcon(file) {
  if (file.type === "folder") {
    return "fas fa-folder folder"
  }

  const ext = file.name.split(".").pop().toLowerCase()

  if (["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"].includes(ext)) {
    return "fas fa-image image"
  } else if (["pdf", "doc", "docx", "txt", "rtf", "odt"].includes(ext)) {
    return "fas fa-file-alt document"
  } else if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)) {
    return "fas fa-file-archive archive"
  } else if (["mp4", "avi", "mkv", "mov", "wmv", "flv", "webm"].includes(ext)) {
    return "fas fa-file-video video"
  } else if (["mp3", "wav", "flac", "aac", "ogg", "wma"].includes(ext)) {
    return "fas fa-file-audio audio"
  } else if (["js", "html", "css", "php", "py", "java", "cpp", "c"].includes(ext)) {
    return "fas fa-file-code"
  } else {
    return "fas fa-file"
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes"

  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
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
            <strong class="me-auto">File Manager</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
        </div>
        <div class="toast-body">${message}</div>
    `

  toastContainer.appendChild(toastEl)

  const toast = new bootstrap.Toast(toastEl)
  toast.show()

  // Remove toast element after it's hidden
  toastEl.addEventListener("hidden.bs.toast", () => {
    toastEl.remove()
  })
}
