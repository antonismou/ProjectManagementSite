document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAuth();
    if (!user) return;

    // Navbar setup
    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay) usernameDisplay.textContent = user.username;
    
    if (user.role === 'ADMIN') {
        const adminLinkContainer = document.getElementById('admin-link-container');
        if (adminLinkContainer) {
            const adminLink = document.createElement('a');
            adminLink.href = 'admin.html';
            adminLink.textContent = 'Admin';
            adminLink.className = 'nav-link';
            adminLinkContainer.appendChild(adminLink);
        }
    }

    // View Elements
    const teamsListView = document.getElementById('teams-list-view');
    const teamDetailView = document.getElementById('team-detail-view');
    const teamsGrid = document.getElementById('teams-grid');
    const teamViewContentDiv = document.getElementById('team-view-content');
    
    // Create Team Elements
    const createTeamBtn = document.getElementById('create-team-main-btn');
    const createTeamForm = document.getElementById('create-team-form');
    const createTeamLeaderSelect = document.getElementById('create-team-leader');
    const createTeamModalEl = document.getElementById('create-team-modal');
    let createTeamModal = createTeamModalEl ? new bootstrap.Modal(createTeamModalEl) : null;

    // Manage Team Elements
    const manageTeamModalEl = document.getElementById('manage-team-modal');
    let manageTeamModal = manageTeamModalEl ? new bootstrap.Modal(manageTeamModalEl) : null;
    const editTeamForm = document.getElementById('edit-team-form');
    const addMemberBtn = document.getElementById('add-member-btn');
    const addMemberSelect = document.getElementById('add-member-select');

    // Helper functions
    function showToast(message, isError = false) {
        const toastContainer = document.querySelector('.toast-container');
        const toastId = `toast-${Date.now()}`;
        const toastHtml = `
            <div id="${toastId}" class="toast ${isError ? 'bg-danger text-white' : 'bg-success text-white'}" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="toast-header">
                    <strong class="me-auto">${isError ? 'Error' : 'Success'}</strong>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
                <div class="toast-body">${message}</div>
            </div>
        `;
        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        const toastEl = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    }

    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function formatDate(dateString) {
        if (!dateString) return '-';
        try { return new Date(dateString).toLocaleDateString(); } catch (e) { return dateString; }
    }

    function formatDateTime(dateTimeString) {
        if (!dateTimeString) return '-';
        try { return new Date(dateTimeString).toLocaleString(); } catch (e) { return dateTimeString; }
    }

    function getPriorityBadgeClass(priority) {
        switch (priority) {
            case 'HIGH': return 'bg-danger';
            case 'MEDIUM': return 'bg-warning text-dark';
            case 'LOW': return 'bg-success';
            default: return 'bg-secondary';
        }
    }

    function getStatusBadgeClass(status) {
        switch (status) {
            case 'IN_PROGRESS': return 'badge bg-warning text-dark';
            case 'DONE': return 'badge bg-success';
            case 'TODO': return 'badge bg-info text-dark';
            default: return 'badge bg-secondary';
        }
    }

    // Role Upgrade Logic
    async function ensureUserIsLeader(userId) {
        try {
            const userData = await apiRequest(USER_SERVICE_URL, `/users/${userId}`);
            if (userData && userData.role === 'MEMBER') {
                await apiRequest(USER_SERVICE_URL, `/users/${userId}/role`, 'PUT', { role: 'TEAM_LEADER' });
                showToast(`User ${userData.username} upgraded to Team Leader.`);
            }
        } catch (e) {
            console.error('Failed to check/upgrade user role', e);
        }
    }

    // --- Main Logic ---

    // Determine view based on URL param
    const urlParams = new URLSearchParams(window.location.search);
    const teamIdParam = urlParams.get('id');

    if (teamIdParam) {
        showDetailView(teamIdParam);
    } else {
        showListView();
    }

    async function showListView() {
        teamsListView.classList.remove('d-none');
        teamDetailView.classList.add('d-none');
        
        // Setup Create Button (Admins only)
        if (user.role === 'ADMIN') {
            createTeamBtn.classList.remove('d-none');
            populateAllUsersSelect(createTeamLeaderSelect); // Populate modal dropdown
        }

        teamsGrid.innerHTML = '<div class="col-12 text-center"><div class="spinner-border" role="status"></div></div>';

        try {
            const teams = await apiRequest(TEAM_SERVICE_URL, '/teams');
            renderTeamsGrid(teams || []);
        } catch (err) {
            teamsGrid.innerHTML = `<div class="alert alert-danger">Failed to load teams: ${err.error || 'Unknown error'}</div>`;
        }
    }

    async function renderTeamsGrid(teams) {
        teamsGrid.innerHTML = '';
        if (teams.length === 0) {
            teamsGrid.innerHTML = '<div class="col-12 text-center text-muted">No teams found.</div>';
            return;
        }

        for (const team of teams) {
            const memberCount = team.members ? (String(team.members).split(',').filter(Boolean).length) : 0;
            const isLeader = team.leader_id === user.id;
            const isAdmin = user.role === 'ADMIN';

            const card = document.createElement('div');
            card.className = 'col-md-4';
            card.innerHTML = `
                <div class="card h-100 shadow-sm">
                    <div class="card-body">
                        <h5 class="card-title">${escapeHtml(team.name)}</h5>
                        <p class="card-text text-muted mb-2">${escapeHtml(team.description || 'No description')}</p>
                        <p class="card-text mb-1"><i class="fas fa-crown me-2 text-warning"></i> <strong>Leader:</strong> ${escapeHtml(team.leader ? team.leader.username : 'Unknown')}</p>
                        <p class="card-text"><i class="fas fa-users me-2"></i> ${memberCount} Members</p>
                    </div>
                    <div class="card-footer bg-white border-top-0 d-flex justify-content-between">
                        <a href="teams.html?id=${team.id}" class="btn btn-outline-primary btn-sm"><i class="fas fa-eye"></i> View</a>
                        <div>
                            ${(isLeader) ? `<button class="btn btn-outline-secondary btn-sm manage-team-btn" data-id="${team.id}"><i class="fas fa-cog"></i> Manage</button>` : ''}
                            ${isAdmin ? `<button class="btn btn-outline-danger btn-sm delete-team-btn" data-id="${team.id}"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                    </div>
                </div>
            `;
            teamsGrid.appendChild(card);
        }

        // Attach event listeners for dynamic buttons
        document.querySelectorAll('.delete-team-btn').forEach(btn => {
            btn.addEventListener('click', handleDeleteTeam);
        });
        document.querySelectorAll('.manage-team-btn').forEach(btn => {
            btn.addEventListener('click', (e) => openManageModal(e.target.closest('button').dataset.id));
        });
    }

    async function showDetailView(id) {
        teamsListView.classList.add('d-none');
        teamDetailView.classList.remove('d-none');
        teamViewContentDiv.innerHTML = '<div class="text-center"><div class="spinner-border" role="status"></div></div>';

        try {
            const team = await apiRequest(TEAM_SERVICE_URL, `/teams/${id}`);
            if (!team) throw new Error("Team not found");

            // Parse members
            let memberIds = [];
             if (typeof team.members === 'string') {
                memberIds = team.members.split(',').map(Number).filter(Boolean);
            } else if (Array.isArray(team.members)) {
                memberIds = team.members.map(Number).filter(Boolean);
            } else if (typeof team.members === 'number') {
                memberIds = [team.members];
            }

            // Fetch tasks and users in parallel
            const [tasks, usersList] = await Promise.all([
                apiRequest(TASK_SERVICE_URL, `/tasks?teamId=${id}`),
                apiRequest(USER_SERVICE_URL, '/users?ids=' + memberIds.join(','))
            ]);

            const userMap = new Map((usersList || []).map(u => [u.id, u]));
            
            // Enrich tasks with assignee names
            if (tasks) {
                // Fetch assignee details if not in team members list (unlikely but possible)
                const assigneeIds = new Set(tasks.map(t => t.assigned_to).filter(Boolean));
                const missingIds = [...assigneeIds].filter(uid => !userMap.has(uid));
                if (missingIds.length > 0) {
                     const missingUsers = await apiRequest(USER_SERVICE_URL, '/users?ids=' + missingIds.join(','));
                     missingUsers.forEach(u => userMap.set(u.id, u));
                }
                
                tasks.forEach(t => {
                    t.assigned_to_details = userMap.get(t.assigned_to);
                });
            }
            
            renderDetailView(team, userMap, tasks || []);

        } catch (err) {
            console.error(err);
            teamViewContentDiv.innerHTML = `<div class="alert alert-danger">Failed to load team: ${err.error || err.message}</div>`;
        }
    }

    function renderDetailView(team, userMap, tasks) {
        const leader = userMap.get(team.leader_id);
        
        let membersHtml = '';
        if (userMap.size > 0) {
            // Filter map to show only actual members of the team
            let memberIds = [];
            if (typeof team.members === 'string') memberIds = team.members.split(',').map(Number);
            else if (Array.isArray(team.members)) memberIds = team.members.map(Number);
            else if (typeof team.members === 'number') memberIds = [team.members];
            
            const actualMembers = memberIds.map(id => userMap.get(id)).filter(Boolean);

            membersHtml = actualMembers.map(m => `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div><i class="fas fa-user me-2"></i> ${escapeHtml(m.username)}</div>
                    <span class="badge bg-primary rounded-pill">${tasks.filter(t => t.assigned_to === m.id).length} Tasks</span>
                </li>
            `).join('');
        } else {
            membersHtml = '<li class="list-group-item">No members.</li>';
        }

        let tasksHtml = '';
        if (tasks.length === 0) {
            tasksHtml = '<p class="text-center p-3">No tasks found.</p>';
        } else {
            tasksHtml = `
                <div class="table-responsive">
                <table class="table table-hover">
                    <thead><tr><th>Title</th><th>Status</th><th>Priority</th><th>Due</th><th>Assignee</th></tr></thead>
                    <tbody>
                        ${tasks.map(t => `
                            <tr style="cursor: pointer" onclick="window.location.href='task.html?id=${t.id}'">
                                <td>${escapeHtml(t.title)}</td>
                                <td><span class="badge ${getStatusBadgeClass(t.status)}">${t.status}</span></td>
                                <td><span class="badge ${getPriorityBadgeClass(t.priority)}">${t.priority}</span></td>
                                <td>${formatDate(t.due_date)}</td>
                                <td>${t.assigned_to_details ? escapeHtml(t.assigned_to_details.username) : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
            `;
        }

        teamViewContentDiv.innerHTML = `
            <div class="card mb-4">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h2 class="mb-0">${escapeHtml(team.name)}</h2>
                    ${(team.leader_id === user.id) ? `<button class="btn btn-secondary manage-team-btn" data-id="${team.id}"><i class="fas fa-cog"></i> Manage Team</button>` : ''}
                </div>
                <div class="card-body">
                    <p><strong>Description:</strong> ${escapeHtml(team.description)}</p>
                    <p><strong>Leader:</strong> ${leader ? escapeHtml(leader.username) : 'Unknown'}</p>
                    <p><strong>Created:</strong> ${formatDateTime(team.created_at)}</p>
                </div>
            </div>
            <div class="row">
                <div class="col-lg-5 mb-4">
                    <div class="card h-100">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            Members
                            ${(team.leader_id === user.id) ? 
                                `<button class="btn btn-sm btn-success add-member-direct-btn"><i class="fas fa-user-plus"></i> Add</button>` : 
                                ''}
                        </div>
                        <ul class="list-group list-group-flush">${membersHtml}</ul>
                    </div>
                </div>
                <div class="col-lg-7 mb-4">
                    <div class="card h-100">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            Tasks
                            ${(team.leader_id === user.id) ? 
                                `<a href="create-task.html?teamId=${team.id}" class="btn btn-sm btn-primary"><i class="fas fa-plus"></i> New Task</a>` : 
                                ''}
                        </div>
                        <div class="card-body p-0">${tasksHtml}</div>
                    </div>
                </div>
            </div>
        `;
        
        // Re-attach manage listener inside detail view
        teamViewContentDiv.querySelectorAll('.manage-team-btn').forEach(btn => {
            btn.addEventListener('click', (e) => openManageModal(team.id));
        });
        
        // Attach Add Member direct button listener
        teamViewContentDiv.querySelectorAll('.add-member-direct-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                openManageModal(team.id);
                // Switch to members tab
                const membersTabBtn = document.querySelector('#manageTeamTabs button[data-bs-target="#manage-members"]');
                if (membersTabBtn) {
                    const tab = new bootstrap.Tab(membersTabBtn);
                    tab.show();
                }
            });
        });
    }

    // --- Create Team ---
    
    async function populateAllUsersSelect(selectEl) {
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">Loading...</option>';
        try {
            // Use /users/public so non-admins can also fetch user list
            const users = await apiRequest(USER_SERVICE_URL, '/users/public');
            selectEl.innerHTML = '<option value="">-- Select User --</option>';
            users.forEach(u => {
                const roleStr = u.role ? ` (${u.role})` : '';
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = `${escapeHtml(u.username)}${roleStr}`;
                selectEl.appendChild(opt);
            });
        } catch (e) {
            console.error("Failed to load users for dropdown", e);
            selectEl.innerHTML = '<option value="">Error loading users</option>';
        }
    }

    if (createTeamForm) {
        createTeamForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const leaderId = parseInt(createTeamLeaderSelect.value);
            const data = {
                name: document.getElementById('create-team-name').value,
                description: document.getElementById('create-team-description').value,
                leader_id: leaderId,
                members: String(leaderId) // Auto-add leader as member
            };
            try {
                await ensureUserIsLeader(leaderId); // Upgrade role first
                const res = await apiRequest(TEAM_SERVICE_URL, '/teams', 'POST', data);
                showToast('Team created successfully!');
                if (createTeamModal) createTeamModal.hide();
                createTeamForm.reset();
                showListView(); // Reload list
            } catch (err) {
                showToast(err.error || 'Failed to create team', true);
            }
        });
    }

    async function handleDeleteTeam(e) {
        if (!confirm('Are you sure? This will delete the team and all associated tasks.')) return;
        const id = e.currentTarget.dataset.id;
        try {
            await apiRequest(TEAM_SERVICE_URL, `/teams/${id}`, 'DELETE');
            showToast('Team deleted.');
            showListView();
        } catch (err) {
            showToast(err.error || 'Delete failed', true);
        }
    }

    // --- Manage Team ---
    
    let currentEditingTeam = null;

    async function openManageModal(teamId) {
        try {
            const team = await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`);
            currentEditingTeam = team;
            
            document.getElementById('edit-team-id').value = team.id;
            document.getElementById('edit-team-name').value = team.name;
            document.getElementById('edit-team-description').value = team.description || '';
            
            populateAllUsersSelect(addMemberSelect);
            renderManageMembersList(team.members);

            if (manageTeamModal) manageTeamModal.show();
        } catch (err) {
            showToast('Failed to load team details for editing', true);
        }
    }
    
    // Parse members helper
    function parseMembers(membersField) {
        if (typeof membersField === 'string') return membersField.split(',').map(Number).filter(Boolean);
        if (Array.isArray(membersField)) return membersField.map(Number).filter(Boolean);
        if (typeof membersField === 'number') return [membersField];
        return [];
    }

    async function renderManageMembersList(membersField) {
        const listEl = document.getElementById('manage-members-list');
        listEl.innerHTML = 'Loading...';
        
        const memberIds = parseMembers(membersField);
        if (memberIds.length === 0) {
            listEl.innerHTML = '<li class="list-group-item">No members</li>';
            return;
        }

        try {
            const users = await apiRequest(USER_SERVICE_URL, '/users?ids=' + memberIds.join(','));
            listEl.innerHTML = '';
            users.forEach(u => {
                const isLeader = currentEditingTeam.leader_id === u.id;
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex justify-content-between align-items-center';
                li.innerHTML = `
                    <span>${escapeHtml(u.username)} ${isLeader ? '<span class="badge bg-warning text-dark ms-2">Leader</span>' : ''}</span>
                    ${!isLeader ? `<button class="btn btn-sm btn-outline-danger remove-member-btn" data-id="${u.id}"><i class="fas fa-times"></i></button>` : ''}
                `;
                listEl.appendChild(li);
            });
            
            listEl.querySelectorAll('.remove-member-btn').forEach(btn => {
                btn.addEventListener('click', (e) => handleRemoveMember(e.target.closest('button').dataset.id));
            });

        } catch (e) {
            listEl.innerHTML = '<li class="list-group-item text-danger">Error loading members</li>';
        }
    }

    editTeamForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('edit-team-name').value,
            description: document.getElementById('edit-team-description').value
        };
        try {
            await apiRequest(TEAM_SERVICE_URL, `/teams/${currentEditingTeam.id}`, 'PUT', data);
            showToast('Team details updated.');
            if (teamIdParam) showDetailView(currentEditingTeam.id);
            else showListView();
        } catch (err) {
            showToast(err.error || 'Update failed', true);
        }
    });

    addMemberBtn.addEventListener('click', async () => {
        const userId = parseInt(addMemberSelect.value);
        if (!userId) return;
        
        const currentMembers = parseMembers(currentEditingTeam.members);
        if (currentMembers.includes(userId)) {
            showToast('User is already a member', true);
            return;
        }
        
        const newMembers = [...currentMembers, userId].join(',');
        try {
            // Update team members
            await apiRequest(TEAM_SERVICE_URL, `/teams/${currentEditingTeam.id}`, 'PUT', { members: newMembers });
            
            // Auto upgrade role if they were just MEMBER
            // NOTE: The requirement was to upgrade role if chosen as LEADER.
            // But if just added as member, role stays MEMBER usually.
            // The user request said: "i want to be able to choose and members as team leader but if i choose a member i want to upgrade the role"
            // This usually implies in "Edit" if I change leader. 
            // Currently my "Edit" form only allows changing Name/Desc and adding/removing members.
            // It does NOT allow changing leader in the "Edit" modal per the simplified request "add/remove member or change title description".
            // So role upgrade applies to CREATION (implemented) and strictly setting leader.
            // If the user wants to CHANGE LEADER in Manage Modal, I would need another dropdown.
            // For now I'll stick to Add/Remove member.
            
            currentEditingTeam.members = newMembers;
            renderManageMembersList(newMembers);
            showToast('Member added');
            
            // Refresh view to show updated count/list
            if (teamIdParam) showDetailView(currentEditingTeam.id);
            else showListView();
        } catch (err) {
            showToast(err.error || 'Failed to add member', true);
        }
    });

    async function handleRemoveMember(userId) {
        if (!confirm('Remove this member?')) return;
        const idToRemove = parseInt(userId);
        const currentMembers = parseMembers(currentEditingTeam.members);
        const newMembers = currentMembers.filter(id => id !== idToRemove).join(',');
        
        try {
            await apiRequest(TEAM_SERVICE_URL, `/teams/${currentEditingTeam.id}`, 'PUT', { members: newMembers });
            currentEditingTeam.members = newMembers;
            renderManageMembersList(newMembers);
            showToast('Member removed');
            
            // Refresh view
            if (teamIdParam) showDetailView(currentEditingTeam.id);
            else showListView();
        } catch (err) {
            showToast(err.error || 'Failed to remove member', true);
        }
    }

});