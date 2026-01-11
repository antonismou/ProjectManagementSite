const currentUser = requireAuth();

const profileContent = document.getElementById('profile-content');

async function loadProfile() {
  if (!currentUser) return;
  
  // Show loading spinner
  profileContent.innerHTML = `
    <div class="text-center">
        <div class="spinner-border" role="status">
            <span class="visually-hidden">Loading...</span>
        </div>
    </div>`;

  try {
    const token = localStorage.getItem('token');
    const user = await apiRequest(USER_SERVICE_URL, `/users/${currentUser.id}`, 'GET', null, token);
    renderProfile(user);
  } catch (err) {
    console.warn('Failed to fetch profile, using local cache', err);
    try {
      const raw = localStorage.getItem('user');
      if (raw) renderProfile(JSON.parse(raw));
      else profileContent.innerHTML = `<div class="alert alert-danger">Could not load profile.</div>`;
    } catch (e) {
      profileContent.innerHTML = `<div class="alert alert-danger">Could not load profile.</div>`;
    }
  }
}

function renderProfile(user) {
  if (!user) {
    profileContent.innerHTML = `<div class="alert alert-danger">Could not load profile.</div>`;
    return;
  }
  
  const activeBadge = user.active ? `<span class="badge bg-success">Yes</span>` : `<span class="badge bg-danger">No</span>`;

  profileContent.innerHTML = `
    <ul class="list-group list-group-flush">
        <li class="list-group-item d-flex justify-content-between align-items-center">
            Username
            <span class="badge bg-primary rounded-pill">${user.username || '-'}</span>
        </li>
        <li class="list-group-item d-flex justify-content-between align-items-center">
            Full Name
            <span>${user.first_name || ''} ${user.last_name || ''}</span>
        </li>
        <li class="list-group-item d-flex justify-content-between align-items-center">
            Email
            <span>${user.email || '-'}</span>
        </li>
        <li class="list-group-item d-flex justify-content-between align-items-center">
            Role
            <span class="badge bg-secondary">${user.role || '-'}</span>
        </li>
        <li class="list-group-item d-flex justify-content-between align-items-center">
            Active
            ${activeBadge}
        </li>
    </ul>
    <div class="d-grid mt-3">
        <button id="refresh-profile" class="btn btn-outline-secondary">
            <i class="fas fa-sync-alt me-2"></i> Refresh
        </button>
    </div>
  `;

  document.getElementById('refresh-profile').addEventListener('click', loadProfile);
}

document.addEventListener('DOMContentLoaded', () => {
    if (!currentUser) return;

    // Navbar setup
    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay) usernameDisplay.textContent = currentUser.username;
    if (currentUser.role === 'ADMIN') {
        const container = document.getElementById('admin-link-container');
        if (container) {
            const a = document.createElement('a');
            a.href = 'admin.html';
            a.textContent = 'Admin';
            a.className = 'nav-link';
            container.appendChild(a);
        }
    }
    
    loadProfile();
});
