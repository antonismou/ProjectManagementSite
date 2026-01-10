// admin.js - simple admin UI to list users, change roles and delete users
(function () {
  const tableBody = document.querySelector('#users-table tbody');
  const refreshBtn = document.getElementById('refresh-btn');
  const notice = document.getElementById('notice');

  function showNotice(msg, err = false) {
    notice.textContent = msg;
    notice.className = err ? 'error' : 'success';
    notice.classList.remove('hidden');
    setTimeout(() => notice.classList.add('hidden'), 5000);
  }

  function requireAdmin() {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return false;
      const user = JSON.parse(raw);
      return user && user.role === 'ADMIN';
    } catch (e) {
      return false;
    }
  }

  function renderUsers(users) {
    tableBody.innerHTML = '';
    users.forEach((u) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.id}</td>
        <td>${u.username}</td>
        <td>${u.first_name || ''} ${u.last_name || ''}</td>
        <td>${u.email || ''}</td>
        <td>
          <select data-id="${u.id}" class="role-select">
            <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
            <option value="TEAM_LEADER" ${u.role === 'TEAM_LEADER' ? 'selected' : ''}>TEAM_LEADER</option>
            <option value="MEMBER" ${u.role === 'MEMBER' ? 'selected' : ''}>MEMBER</option>
          </select>
          <button class="save-role" data-id="${u.id}">Save</button>
        </td>
        <td>${u.active ? 'Yes' : 'No'}</td>
        <td>
          <button class="view-user" data-id="${u.id}">View</button>
          ${u.active ? `<button class="deactivate-user" data-id="${u.id}">Deactivate</button>` : `<button class="activate-user" data-id="${u.id}">Activate</button>`}
          <button class="delete-user" data-id="${u.id}">Delete</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    // attach listeners
    tableBody.querySelectorAll('.save-role').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const select = tableBody.querySelector(`select[data-id="${id}"]`);
        const role = select.value;
        try {
          await apiRequest(USER_SERVICE_URL, `/users/${id}/role`, 'PUT', { role });
          showNotice('Role updated');
          await loadUsers();
        } catch (err) {
          showNotice(err.error || 'Failed to update role', true);
        }
      });
    });

    tableBody.querySelectorAll('.delete-user').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        if (!confirm(`Delete user #${id}? This cannot be undone.`)) return;
        try {
          await apiRequest(USER_SERVICE_URL, `/users/${id}`, 'DELETE');
          showNotice('User deleted');
          await loadUsers();
        } catch (err) {
          showNotice(err.error || 'Failed to delete user', true);
        }
      });
    });

    // Activate / Deactivate handlers
    tableBody.querySelectorAll('.activate-user').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        if (!confirm(`Activate user #${id}?`)) return;
        try {
          await apiRequest(USER_SERVICE_URL, `/users/${id}/active`, 'PUT', { active: true });
          showNotice('User activated');
          await loadUsers();
        } catch (err) {
          showNotice(err.error || 'Failed to activate user', true);
        }
      });
    });

    tableBody.querySelectorAll('.deactivate-user').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        if (!confirm(`Deactivate user #${id}?`)) return;
        try {
          await apiRequest(USER_SERVICE_URL, `/users/${id}/active`, 'PUT', { active: false });
          showNotice('User deactivated');
          await loadUsers();
        } catch (err) {
          showNotice(err.error || 'Failed to deactivate user', true);
        }
      });
    });

    tableBody.querySelectorAll('.view-user').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        try {
          const user = await apiRequest(USER_SERVICE_URL, `/users/${id}`, 'GET');
          alert(JSON.stringify(user, null, 2));
        } catch (err) {
          showNotice(err.error || 'Failed to fetch user', true);
        }
      });
    });
  }

  async function loadUsers() {
    try {
      const users = await apiRequest(USER_SERVICE_URL, '/users', 'GET');
      renderUsers(users);
    } catch (err) {
      showNotice(err.error || 'Failed to load users', true);
      if (err && err.error === 'Forbidden: admin only') {
        alert('You must be an ADMIN to view this page.');
        window.location.href = 'index.html';
      }
    }
  }

  // init
  document.addEventListener('DOMContentLoaded', () => {
    if (!requireAdmin()) {
      alert('Admin access required');
      window.location.href = 'index.html';
      return;
    }

    refreshBtn.addEventListener('click', loadUsers);
    loadUsers();
  });
})();
