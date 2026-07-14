// =============================================
//  ROUTE FILE MANIPULATION
//  Solo mappatura URL → controller. La logica sta nel fileOpsService.
// =============================================

const path = require("path");
const { creaFileOpsService } = require("../services/fileOpsService");
const { creaFileOpsController } = require("../controllers/fileOpsController");

function setupFileManipulationRoutes(app, db, io, requireLogin, requireAdmin) {
  const baseFolder = path.join(__dirname, "../../../frontend/uploads");
  const fileOps = creaFileOpsService(db, io, baseFolder);
  const controller = creaFileOpsController(fileOps);

  app.post("/api/rename", requireLogin, controller.rename);
  app.post("/api/copy-move", requireLogin, controller.copyMove);
  app.delete("/api/delete/*", requireLogin, controller.deletePath);
  app.delete("/api/delete-all", requireAdmin, controller.deleteAll);
  app.post("/api/create-folder", requireLogin, controller.createFolder);
}

module.exports = { setupFileManipulationRoutes };
