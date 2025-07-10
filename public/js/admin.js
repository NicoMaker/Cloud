// Initialize admin panel
document.addEventListener("DOMContentLoaded", () => {
    loadUsers()
    checkUrlParams()
})

function loadUsers() {
    fetch("/api/users")
        .then((res) => res.json())
        .then((users) => {
            const table = document.getElementById("userTable")
            table.innerHTML = ""

            users.forEach((user) => {
                const row = document.createElement("tr")
                row.className = "fade-in"
                row.innerHTML = `
                    <td><strong>#${user.id}</strong></td>
                    <td>
                        <i class="fas fa-user me-2"></i>
                        ${user.username}
                    </td>
                    <td>
                        <span class="badge ${user.role === "admin" ? "bg-danger" : "bg-primary"}">
                            <i class="fas ${user.role === "admin" ? "fa-crown" : "fa-user"} me-1"></i>
                            ${user.role.toUpperCase()}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-outline-primary btn-sm me-1" onclick="editUser(${user.id}, '${user.username}', '${user.password}', '${user.role}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        ${user.id !== 1
                        ? `
                            <button class="btn btn-outline-danger btn-sm" onclick="deleteUser(${user.id}, '${user.username}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        `
                        : `
                            <span class="text-muted small">
                                <i class="fas fa-shield-alt me-1"></i>Protected
                            </span>
                        `
                    }
                    </td>
                `
                table.appendChild(row)
            })
        })
        .catch((err) => {
            console.error("Failed to load users:", err)
            showAlert("Failed to load users", "danger")
        })
}

function editUser(id, username, password, role) {
    document.getElementById("editUserId").value = id
    document.getElementById("editUsername").value = username
    document.getElementById("editPassword").value = password
    document.getElementById("editRole").value = role

    const modal = window.bootstrap.Modal.getOrCreateInstance(document.getElementById("editUserModal"))
    modal.show()
}

function deleteUser(id, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) return

    const form = document.createElement("form")
    form.method = "POST"
    form.action = "/delete-user"
    form.innerHTML = `<input type="hidden" name="id" value="${id}">`
    document.body.appendChild(form)
    form.submit()
}

function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search)
    const success = urlParams.get("success")
    const error = urlParams.get("error")

    if (success) {
        const messages = {
            user_created: "User created successfully!",
            user_updated: "User updated successfully!",
            user_deleted: "User deleted successfully!",
        }
        showAlert(messages[success] || "Operation completed successfully!", "success")
    }

    if (error) {
        const messages = {
            missing_fields: "Please fill in all required fields.",
            user_exists: "Username already exists.",
            update_failed: "Failed to update user.",
            delete_failed: "Failed to delete user.",
            cannot_delete_admin: "Cannot delete the main admin user.",
        }
        showAlert(messages[error] || "An error occurred.", "danger")
    }
}

function showAlert(message, type) {
    const alertContainer = document.getElementById("alertContainer")
    const alertId = "alert-" + Date.now()

    const alertEl = document.createElement("div")
    alertEl.id = alertId
    alertEl.className = `alert alert-${type} alert-dismissible fade show`
    alertEl.innerHTML = `
        <i class="fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-triangle"} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `

    alertContainer.appendChild(alertEl)

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (document.getElementById(alertId)) {
            const alert = window.bootstrap.Alert.getOrCreateInstance(alertEl)
            alert.close()
        }
    }, 5000)
}

// Add fade-in animation
const style = document.createElement("style")
style.textContent = `
    .fade-in {
        animation: fadeIn 0.3s ease;
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`
document.head.appendChild(style)
