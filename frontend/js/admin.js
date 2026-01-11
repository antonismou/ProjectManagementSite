(function () {
    const tableBody = document.querySelector('#users-table-body');
    const refreshBtn = document.getElementById('refresh-btn');
    const notice = document.getElementById('notice');
    const currentUser = requireAuth();
    const jsonModal = new bootstrap.Modal(document.getElementById('json-modal'));

    function showNotice(msg, isError = false) {
        notice.textContent = msg;
        notice.className = `alert ${isError ? 'alert-danger' : 'alert-success'}`;
        notice.classList.remove('d-none');
        setTimeout(() => notice.classList.add('d-none'), 5000);
    }

    function requireAdmin() {
        return currentUser && currentUser.role === 'ADMIN';
    }

    function renderUsers(users) {
        if (!tableBody) return;
        tableBody.innerHTML = '';
        users.forEach((u) => {
            const tr = document.createElement('tr');
            const activeBadge = u.active ? `<span class="badge bg-success">Yes</span>` : `<span class="badge bg-danger">No</span>`;
            
            tr.innerHTML = `
                <td>${u.id}</td>
                <td>${u.username}</td>
                <td>${u.first_name || ''} ${u.last_name || ''}</td>
                <td>${u.email || ''}</td>
                <td>
                    <div class="input-group">
                        <select data-id="${u.id}" class="form-select form-select-sm">
                            <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
                            <option value="TEAM_LEADER" ${u.role === 'TEAM_LEADER' ? 'selected' : ''}>TEAM_LEADER</option>
                            <option value="MEMBER" ${u.role === 'MEMBER' ? 'selected' : ''}>MEMBER</option>
                        </select>
                        <button class="btn btn-sm btn-outline-success save-role" data-id="${u.id}" title="Save Role"><i class="fas fa-save"></i></button>
                    </div>
                </td>
                <td>${activeBadge}</td>
                <td class="text-end">
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline-secondary view-user" data-id="${u.id}" title="View JSON"><i class="fas fa-eye"></i></button>
                        ${u.active ? `<button class="btn btn-sm btn-outline-warning deactivate-user" data-id="${u.id}" title="Deactivate"><i class="fas fa-user-slash"></i></button>` : `<button class="btn btn-sm btn-outline-success activate-user" data-id="${u.id}" title="Activate"><i class="fas fa-user-check"></i></button>`}
                        <button class="btn btn-sm btn-outline-danger delete-user" data-id="${u.id}" title="Delete"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Attach event listeners
        tableBody.querySelectorAll('.save-role').forEach(btn => btn.addEventListener('click', handleSaveRole));
        tableBody.querySelectorAll('.delete-user').forEach(btn => btn.addEventListener('click', handleDeleteUser));
        tableBody.querySelectorAll('.activate-user').forEach(btn => btn.addEventListener('click', handleActivateUser));
        tableBody.querySelectorAll('.deactivate-user').forEach(btn => btn.addEventListener('click', handleDeactivateUser));
        tableBody.querySelectorAll('.view-user').forEach(btn => btn.addEventListener('click', handleViewUser));
    }



    async function handleSaveRole(e) {
        const id = e.currentTarget.closest('.save-role').dataset.id;
        const select = tableBody.querySelector(`select[data-id="${id}"]`);
        try {
            await apiRequest(USER_SERVICE_URL, `/users/${id}/role`, 'PUT', { role: select.value }, localStorage.getItem('token'));
            showNotice('Role updated successfully.');
            loadUsers();
        } catch (err) {
            showNotice(err.error || 'Failed to update role.', true);
        }
    }

    async function handleDeleteUser(e) {
        const id = e.currentTarget.closest('.delete-user').dataset.id;
        if (!confirm(`Are you sure you want to delete user #${id}? This cannot be undone.`)) return;
        try {
            await apiRequest(USER_SERVICE_URL, `/users/${id}`, 'DELETE', null, localStorage.getItem('token'));
            showNotice('User deleted successfully.');
            loadUsers();
        } catch (err) {
            showNotice(err.error || 'Failed to delete user.', true);
        }
    }

    async function handleActivateUser(e) {
        const id = e.currentTarget.closest('.activate-user').dataset.id;
        try {
            await apiRequest(USER_SERVICE_URL, `/users/${id}/active`, 'PUT', { active: true }, localStorage.getItem('token'));
            showNotice('User activated.');
            loadUsers();
        } catch (err) {
            showNotice(err.error || 'Failed to activate user.', true);
        }
    }

    async function handleDeactivateUser(e) {
        const id = e.currentTarget.closest('.deactivate-user').dataset.id;
        try {
            await apiRequest(USER_SERVICE_URL, `/users/${id}/active`, 'PUT', { active: false }, localStorage.getItem('token'));
            showNotice('User deactivated.');
            loadUsers();
        } catch (err) {
            showNotice(err.error || 'Failed to deactivate user.', true);
        }
    }
    
    async function handleViewUser(e) {
        const id = e.currentTarget.closest('.view-user').dataset.id;
        try {
            const user = await apiRequest(USER_SERVICE_URL, `/users/${id}`, 'GET', null, localStorage.getItem('token'));
            document.getElementById('json-modal-content').textContent = JSON.stringify(user, null, 2);
            jsonModal.show();
        } catch (err) {
            showNotice(err.error || 'Failed to fetch user data.', true);
        }
    }

    async function loadUsers() {
        if (!tableBody) return;
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';
        try {
            const users = await apiRequest(USER_SERVICE_URL, '/users', 'GET', null, localStorage.getItem('token'));
            renderUsers(users);
        } catch (err) {
            showNotice(err.error || 'Failed to load users.', true);
            if (err && err.error === 'Forbidden: admin only') {
                window.location.href = 'dashboard.html';
            }
        }
    }

    // Initial setup
    if (!requireAdmin()) {
        alert('You must be an ADMIN to view this page.');
        window.location.href = 'dashboard.html';
        return;
    }

    // Navbar setup
    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay) usernameDisplay.textContent = currentUser.username;
    
    refreshBtn.addEventListener('click', loadUsers);
    loadUsers();

})();