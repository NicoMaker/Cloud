// =============================================
//  UI UTILITIES — Toast notifiche moderne
// =============================================

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const id = "toast-" + Date.now();

  const icons = {
    success: "fas fa-circle-check",
    error:   "fas fa-circle-exclamation",
    danger:  "fas fa-circle-exclamation",
    warning: "fas fa-triangle-exclamation",
    info:    "fas fa-circle-info",
  };

  const el = document.createElement("div");
  el.id = id;
  el.className = `toast-item toast-${type === "danger" ? "danger" : type}`;
  el.innerHTML = `
    <i class="${icons[type] || icons.info}"></i>
    <span style="flex:1">${message}</span>
    <button class="toast-close" onclick="this.closest('.toast-item').remove()">
      <i class="fas fa-xmark"></i>
    </button>
  `;

  container.appendChild(el);

  // Auto remove after 4 seconds
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(40px)";
    el.style.transition = "opacity .3s ease, transform .3s ease";
    setTimeout(() => el.remove(), 300);
  }, 4000);
}
