// =============================================
//  ADMIN: BOOTSTRAP DELLA PAGINA
// =============================================
// Collega i moduli password/users/alerts all'avvio.

document.addEventListener("DOMContentLoaded", () => {
  loadUsers();
  checkUrlParams();
  setupPasswordValidation();
});
