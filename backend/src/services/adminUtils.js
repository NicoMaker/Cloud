// =============================================
//  UTILITÀ GESTIONE ADMIN
// =============================================

function countAdmins(db, callback) {
  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", callback);
}

function canDeleteAdmin(db, adminId, callback) {
  countAdmins(db, (err, row) => {
    if (err) return callback(err, false);
    callback(null, row.count > 1);
  });
}

function canChangeAdminToUser(db, adminId, callback) {
  countAdmins(db, (err, row) => {
    if (err) return callback(err, false);
    callback(null, row.count > 1);
  });
}

module.exports = {
  countAdmins,
  canDeleteAdmin,
  canChangeAdminToUser,
};
