// =============================================
//  VARIABILI GLOBALI CONDIVISE
// =============================================

window.currentPath = "";
window.selectedFiles = [];
window.socket = null;
window.userRole = "user";
window.currentUserId = null;
window.isUploading = false;
window.copyMoveAction = null;
window.copyMoveSourcePath = null;
window.mainFolderNames = [];

// Helper browser-safe per ottenere il nome base di un path
window.pathBasename = function(p) {
  return (p || "").replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
};
