// =============================================
//  UI UTILITIES - TOAST & NOTIFICHE
// =============================================

function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toastContainer");
  const toastId = "toast-" + Date.now();

  const toastColors = {
    success: "text-bg-success",
    error:   "text-bg-danger",
    danger:  "text-bg-danger",
    warning: "text-bg-warning",
    info:    "text-bg-info",
  };

  const toastIcons = {
    success: "fas fa-check-circle",
    error:   "fas fa-exclamation-triangle",
    danger:  "fas fa-exclamation-triangle",
    warning: "fas fa-exclamation-circle",
    info:    "fas fa-info-circle",
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

  toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
}
