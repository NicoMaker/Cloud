// =============================================
//  ADMIN: GESTIONE UTENTI (lista, modifica, eliminazione)
// =============================================

function loadUsers() {
  fetch("/api/users")
    .then((res) => res.json())
    .then((data) => {
      const table = document.getElementById("userTable");
      table.innerHTML = "";

      const users = data.users || data;

      users.forEach((user) => {
        const row = document.createElement("tr");
        row.className = "fade-in";

        const createdDate = user.created_at
          ? new Date(user.created_at).toLocaleDateString("it-IT")
          : "N/A";
        const lastLogin = user.last_login
          ? new Date(user.last_login).toLocaleDateString("it-IT")
          : "Mai";

        let protectionBadge = "";
        if (user.isProtected) {
          protectionBadge = `
            <span class="badge-protected"
                  title="Ultimo amministratore: puoi modificare nome e password, ma non il ruolo">
              <i class="fas fa-shield-alt"></i> Ultimo Admin
            </span>
          `;
        }

        row.innerHTML = `
          <td><strong style="color:var(--text-3);font-size:.82rem;">#${user.id}</strong></td>
          <td>
            <span style="display:flex;align-items:center;gap:.45rem;">
              <i class="fas fa-circle-user" style="color:var(--text-3)"></i>
              <strong style="font-weight:600">${user.username}</strong>
            </span>
          </td>
          <td>
            <span class="role-badge ${user.role === "admin" ? "role-admin" : "role-user"}">
              <i class="fas ${user.role === "admin" ? "fa-crown" : "fa-user"}"></i>
              ${user.role.toUpperCase()}
            </span>
            ${protectionBadge}
          </td>
          <td style="color:var(--text-3);font-size:.82rem;">${createdDate}</td>
          <td style="color:var(--text-3);font-size:.82rem;">${lastLogin}</td>
          <td>
            <div class="user-actions">
              <button class="admin-btn admin-btn-outline-primary admin-btn-sm"
                      onclick="editUser(${user.id}, '${user.username}', '${user.role}', ${!!user.canChangeRole})">
                <i class="fas fa-pen"></i> Modifica
              </button>
              ${
                user.canDelete
                  ? `<button class="admin-btn admin-btn-outline-danger admin-btn-sm"
                           onclick="deleteUser(${user.id}, '${user.username}')">
                     <i class="fas fa-trash"></i> Elimina
                   </button>`
                  : `<span style="color:var(--text-3);font-size:.78rem;display:flex;align-items:center;gap:.3rem;">
                     <i class="fas fa-shield-alt"></i> Protetto
                   </span>`
              }
            </div>
          </td>
        `;
        table.appendChild(row);
      });
    })
    .catch((err) => {
      console.error("Failed to load users:", err);
      showAlert("Errore nel caricamento utenti", "danger");
    });
}

function editUser(id, username, role, canChangeRole = true) {
  document.getElementById("editUserId").value = id;
  document.getElementById("editUsername").value = username;
  document.getElementById("editPassword").value = "";

  const roleSelect = document.getElementById("editRole");
  roleSelect.value = role;

  const modalBody = roleSelect.closest(".modal-body");
  const existingWarning = modalBody.querySelector(".admin-protection-warning");
  if (existingWarning) existingWarning.remove();

  if (!canChangeRole && role === "admin") {
    roleSelect.disabled = true;
    roleSelect.title = "Non puoi cambiare il ruolo dell'ultimo amministratore";

    let hiddenRole = modalBody.querySelector("#hiddenRole");
    if (!hiddenRole) {
      hiddenRole = document.createElement("input");
      hiddenRole.type = "hidden";
      hiddenRole.name = "role";
      hiddenRole.id = "hiddenRole";
      modalBody.appendChild(hiddenRole);
    }
    hiddenRole.value = role;

    const warningDiv = document.createElement("div");
    warningDiv.className = "admin-protection-warning alert alert-warning mt-2";
    warningDiv.innerHTML = `
      <i class="fas fa-shield-alt me-2"></i>
      <strong>Ultimo Amministratore:</strong> Puoi modificare nome e password,
      ma non puoi cambiare il ruolo finché non esistono altri amministratori.
    `;
    modalBody.appendChild(warningDiv);
  } else {
    roleSelect.disabled = false;
    roleSelect.title = "";

    const hiddenRole = modalBody.querySelector("#hiddenRole");
    if (hiddenRole) hiddenRole.remove();
  }

  const modal = window.bootstrap.Modal.getOrCreateInstance(
    document.getElementById("editUserModal"),
  );
  modal.show();
}

function deleteUser(id, username) {
  if (!confirm(`Sei sicuro di voler eliminare l'utente "${username}"?`)) return;

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/delete-user";
  form.innerHTML = `<input type="hidden" name="id" value="${id}">`;
  document.body.appendChild(form);
  form.submit();
}

// Esposizione globale (editUser/deleteUser chiamate da onclick inline)
window.loadUsers = loadUsers;
window.editUser = editUser;
window.deleteUser = deleteUser;
