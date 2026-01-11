const currentUser = requireAuth();

const profileContent = document.getElementById('profile-content');

async function loadProfile() {
  if (!currentUser) return;
  
  // Show loading spinner
  profileContent.innerHTML = `
    <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
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
    profileContent.innerHTML = `<div class="alert alert-danger text-center">Could not load profile.</div>`;
    return;
  }
  
  const activeBadge = user.active ? 
    `<span class="badge bg-success-subtle text-success border border-success px-3 rounded-pill">Active</span>` : 
    `<span class="badge bg-danger-subtle text-danger border border-danger px-3 rounded-pill">Inactive</span>`;

  profileContent.innerHTML = `
    <div class="row g-4">
        <div class="col-12 text-center mb-2">
            <h3 class="mb-1">${user.first_name || ''} ${user.last_name || ''}</h3>
            <span class="badge bg-secondary text-uppercase py-2 px-3">${user.role || 'Member'}</span>
        </div>
        
        <hr class="mt-2 mb-0">

        <div class="col-12">
            <div class="d-flex align-items-center mb-3">
                <div class="bg-light rounded-circle p-3 me-3">
                    <i class="fas fa-id-card text-primary"></i>
                </div>
                <div>
                    <label class="text-muted small d-block">Username</label>
                    <span class="fw-bold h5 mb-0">${user.username || '-'}</span>
                </div>
            </div>
            
            <div class="d-flex align-items-center mb-3">
                <div class="bg-light rounded-circle p-3 me-3">
                    <i class="fas fa-envelope text-primary"></i>
                </div>
                <div>
                    <label class="text-muted small d-block">Email Address</label>
                    <span class="fw-bold h5 mb-0">${user.email || '-'}</span>
                </div>
            </div>

            <div class="d-flex align-items-center mb-3">
                <div class="bg-light rounded-circle p-3 me-3">
                    <i class="fas fa-toggle-on text-primary"></i>
                </div>
                <div>
                    <label class="text-muted small d-block">Account Status</label>
                    ${activeBadge}
                </div>
            </div>
        </div>
    </div>

    <div class="d-grid mt-4 pt-3">
        <button id="refresh-profile" class="btn btn-primary py-2 shadow-sm">
            <i class="fas fa-sync-alt me-2"></i> Refresh Profile Data
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