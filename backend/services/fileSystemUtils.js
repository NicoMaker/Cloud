// =============================================
//  UTILITÀ FILE SYSTEM
// =============================================

const fs = require("fs");
const path = require("path");

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function validatePathTraversal(fullPath, baseFolder) {
  return fullPath.startsWith(baseFolder);
}

function ensureUploadFolder(baseFolder) {
  if (!fs.existsSync(baseFolder)) {
    fs.mkdirSync(baseFolder, { recursive: true });
  }
}

module.exports = {
  copyRecursive,
  validatePathTraversal,
  ensureUploadFolder,
};
