// profile.js - show current user's profile in the left sidebar
const currentUserForProfile = requireAuth();

const profileContent = document.getElementById('profile-content');

async function loadProfileSidebar() {
  if (!currentUserForProfile) return;
  try {
    const token = localStorage.getItem('token');
    const user = await apiRequest(USER_SERVICE_URL, `/users/${currentUserForProfile.id}`, 'GET', null, token);
    renderProfileSidebar(user);
  } catch (err) {
    console.warn('Failed to fetch profile, using local cache', err);
    try {
      const raw = localStorage.getItem('user');
      if (raw) renderProfileSidebar(JSON.parse(raw));
      else profileContent.textContent = 'Προφίλ δεν διατίθεται.';
    } catch (e) {
      profileContent.textContent = 'Προφίλ δεν διατίθεται.';
    }
  }
}

function renderProfileSidebar(user) {
  if (!user) { profileContent.textContent = 'Προφίλ δεν διατίθεται.'; return; }
  profileContent.innerHTML = `
    <div class="profile-row"><strong>Username:</strong> ${user.username || '-'}</div>
    <div class="profile-row"><strong>Όνομα:</strong> ${user.first_name || '-'} ${user.last_name || ''}</div>
    <div class="profile-row"><strong>Email:</strong> ${user.email || '-'}</div>
    <div class="profile-row"><strong>Role:</strong> ${user.role || '-'}</div>
    <div class="profile-row"><strong>Active:</strong> ${user.active ? 'Yes' : 'No'}</div>
    <div style="margin-top:0.5rem;"><button id="refresh-profile">Ανανέωση</button></div>
  `;

  const refreshBtn = document.getElementById('refresh-profile');
  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    profileContent.textContent = 'Φόρτωση…';
    await loadProfileSidebar();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadProfileSidebar();
});
