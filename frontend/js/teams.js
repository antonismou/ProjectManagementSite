document.addEventListener("DOMContentLoaded", () => {
    console.log("teams.js loaded");

    const currentUser = requireAuth();
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


    const teamsList = document.getElementById("teams-list");
    const createTeamBtn = document.getElementById("create-team-btn");
    const createTeamForm = document.getElementById("create-team-form");

    // Modal instances
    const teamModal = new bootstrap.Modal(document.getElementById('team-modal'));
    const teamViewModal = new bootstrap.Modal(document.getElementById('team-view-modal'));
    const teamMembersModal = new bootstrap.Modal(document.getElementById('team-members-modal'));
    const taskModal = new bootstrap.Modal(document.getElementById('task-modal')); // New task modal

    let editingTeamId = null;
    let currentTeamId = null; // Store the ID of the team currently being viewed

    // Hide create button for non-admins
    if (currentUser.role !== 'ADMIN') {
        createTeamBtn.classList.add('d-none');
    }

    async function loadTeams() {
        const token = localStorage.getItem("token");
        try {
            const teams = await apiRequest(TEAM_SERVICE_URL, "/teams", "GET", null, token);
            renderTeams(teams);
        } catch (err) {
            console.error("Failed to load teams:", err);
            teamsList.innerHTML = `<div class="col"><div class="alert alert-danger">Failed to load teams.</div></div>`;
        }
    }

    function renderTeams(teams) {
        teamsList.innerHTML = "";
        teams.forEach(team => {
            const teamCol = document.createElement("div");
            teamCol.className = "col";

            const canEdit = currentUser && (currentUser.role === 'ADMIN' || (currentUser.role === 'TEAM_LEADER' && Number(currentUser.id) === Number(team.leader_id)));
            const canDelete = currentUser && currentUser.role === 'ADMIN';
            const canManageMembers = currentUser && (currentUser.role === 'TEAM_LEADER' && Number(currentUser.id) === Number(team.leader_id));

            let buttons = `<button class="btn btn-sm btn-outline-secondary view-team" data-id="${team.id}">View</button>`;
            if (canManageMembers) {
                buttons += `<button class="btn btn-sm btn-outline-primary manage-members" data-id="${team.id}">Manage Members</button>`;
            }
            if (canEdit) {
                buttons += `<button class="btn btn-sm btn-outline-success edit-team" data-id="${team.id}">Edit</button>`;
            }
            if (canDelete) {
                buttons += `<button class="btn btn-sm btn-outline-danger delete-team" data-id="${team.id}">Delete</button>`;
            }

            teamCol.innerHTML = `
                <div class="card h-100 team-card">
                    <div class="card-body">
                        <h5 class="card-title">${team.name}</h5>
                        <p class="card-text">${team.description}</p>
                        <div class="d-flex justify-content-between text-muted">
                            <small>Leader: ${team.leader ? team.leader.username : (team.leader_id || '-')}</small>
                            <small>${team.members ? team.members.length : 0} members</small>
                        </div>
                    </div>
                    <div class="card-footer bg-transparent border-top-0">
                        <div class="btn-group w-100" role="group">
                            ${buttons}
                        </div>
                    </div>
                </div>
            `;
            teamsList.appendChild(teamCol);
        });

        // Add event listeners after cards are rendered
        teamsList.querySelectorAll('.view-team').forEach(btn => btn.addEventListener('click', handleViewTeam));
        teamsList.querySelectorAll('.edit-team').forEach(btn => btn.addEventListener('click', handleEditTeam));
        teamsList.querySelectorAll('.delete-team').forEach(btn => btn.addEventListener('click', handleDeleteTeam));
        teamsList.querySelectorAll('.manage-members').forEach(btn => btn.addEventListener('click', handleManageMembers));
    }
    
    async function handleViewTeam(e) {
        const teamId = e.target.dataset.id;
        currentTeamId = teamId; // Store the current team ID
        try {
            const token = localStorage.getItem('token');
            const team = await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'GET', null, token);
            const tasks = await apiRequest(TASK_SERVICE_URL, '/tasks', 'GET', null, token);
            const teamTasks = (tasks || []).filter(t => Number(t.team_id) === Number(team.id));

            const contentEl = document.getElementById('team-view-content');
            
            let membersHtml = team.members && team.members.length ? team.members.map(m => `<li>${m.first_name} ${m.last_name} (${m.username})</li>`).join('') : '<li>No members</li>';
            let tasksHtml = teamTasks.length ? teamTasks.map(t => `<li><a href="task.html?id=${t.id}">${t.title}</a> - <span class="badge bg-info">${t.status}</span></li>`).join('') : '<li>No tasks for this team</li>';

            const canCreateTask = currentUser && (currentUser.role === 'ADMIN' || (currentUser.role === 'TEAM_LEADER' && Number(currentUser.id) === Number(team.leader_id)));
            const createTaskButton = canCreateTask ? `<button id="create-task-btn" class="btn btn-sm btn-success mb-3"><i class="fas fa-plus me-2"></i> Create New Task</button>` : '';

            contentEl.innerHTML = `
                <h4>${team.name}</h4>
                <p>${team.description}</p>
                <hr>
                <h6>Leader</h6>
                <p>${team.leader ? `${team.leader.first_name} ${team.leader.last_name} (${team.leader.username})` : 'None'}</p>
                <h6>Members</h6>
                <ul>${membersHtml}</ul>
                <h6>Tasks</h6>
                ${createTaskButton}
                <ul>${tasksHtml}</ul>
            `;
            
            if (canCreateTask) {
                document.getElementById('create-task-btn').addEventListener('click', () => openTaskModal(teamId));
            }
            teamViewModal.show();
        } catch (err) {
            showToast(err.error || 'Failed to load team details', true);
        }
    }

    async function handleManageMembers(e) {
        const teamId = e.target.dataset.id;
        try {
            const token = localStorage.getItem('token');
            const team = await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'GET', null, token);
            const users = await apiRequest(USER_SERVICE_URL, '/users/public', 'GET', null, token);
            const contentEl = document.getElementById('team-members-content');
            
            const existingMemberIds = team.members.map(m => m.id);
            let membersHtml = team.members.map(m => `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    ${m.first_name} ${m.last_name} (${m.username})
                    <button class="btn btn-sm btn-danger remove-member" data-team-id="${team.id}" data-member-id="${m.id}">Remove</button>
                </li>
            `).join('');

            let userOptions = users
                .filter(u => !existingMemberIds.includes(u.id))
                .map(u => `<option value="${u.id}">${u.username} (${u.first_name} ${u.last_name})</option>`).join('');

            contentEl.innerHTML = `
                <h5>Current Members</h5>
                <ul class="list-group mb-4">${membersHtml || '<li class="list-group-item">No members yet.</li>'}</ul>
                <h5>Add New Member</h5>
                <div class="input-group">
                    <select class="form-select" id="add-member-select">${userOptions}</select>
                    <button class="btn btn-primary" id="add-member-confirm" data-team-id="${team.id}">Add</button>
                </div>
            `;

            contentEl.querySelectorAll('.remove-member').forEach(btn => btn.addEventListener('click', handleRemoveMember));
            contentEl.querySelector('#add-member-confirm').addEventListener('click', handleAddMember);

            teamMembersModal.show();
        } catch (err) {
            showToast(err.error || 'Failed to load team members', true);
        }
    }

    async function handleAddMember(e) {
        const teamId = e.target.dataset.teamId;
        const select = document.getElementById('add-member-select');
        const memberIdToAdd = parseInt(select.value);

        if (!select.value || isNaN(memberIdToAdd)) {
            showToast('Please select a user to add.', true);
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const team = await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'GET', null, token);
            const existingMemberIds = team.members.map(m => m.id);

            if (existingMemberIds.includes(memberIdToAdd)) {
                showToast('User is already in the team.', true);
                return;
            }
            
            const newMembers = [...existingMemberIds, memberIdToAdd];
            await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'PUT', { members: newMembers }, token);
            showToast('Member added successfully.');
            teamMembersModal.hide();
            loadTeams();
        } catch (err) {
            showToast(err.error || 'Failed to add member', true);
        }
    }

    async function handleRemoveMember(e) {
        const { teamId, memberId } = e.target.dataset;
        if (!confirm('Are you sure you want to remove this member?')) return;

        try {
            const token = localStorage.getItem('token');
            const team = await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'GET', null, token);
            const newMembers = team.members.map(m => m.id).filter(id => id !== parseInt(memberId));
            await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'PUT', { members: newMembers }, token);
            showToast('Member removed successfully.');
            teamMembersModal.hide();
            loadTeams();
        } catch (err) {
            showToast(err.error || 'Failed to remove member', true);
        }
    }

    function handleEditTeam(e) {
        const teamId = e.target.dataset.id;
        apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'GET', null, localStorage.getItem('token'))
            .then(team => openCreateEditModal(team));
    }
    
    async function handleDeleteTeam(e) {
        const teamId = e.target.dataset.id;
        if (!confirm('Are you sure you want to delete this team?')) return;

        try {
            await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'DELETE', null, localStorage.getItem('token'));
            showToast('Team deleted.');
            loadTeams();
        } catch (err) {
            showToast(err.error || 'Failed to delete team.', true);
        }
    }

    async function openCreateEditModal(team = null) {
        editingTeamId = team ? team.id : null;
        const modalTitle = document.querySelector('#team-modal .modal-title');
        modalTitle.textContent = team ? 'Edit Team' : 'Create New Team';
        
        createTeamForm.reset();

        const users = await apiRequest(USER_SERVICE_URL, '/users/public', 'GET', null, localStorage.getItem('token'));
        const leaderSelect = document.getElementById('leader-select');
        leaderSelect.innerHTML = '<option value="">- Select Leader -</option>' + users.map(u => `<option value="${u.id}">${u.username}</option>`).join('');

        if (team) {
            createTeamForm.querySelector('[name="name"]').value = team.name;
            createTeamForm.querySelector('[name="description"]').value = team.description;
            leaderSelect.value = team.leader_id || '';
        }
        
        teamModal.show();
    }

    async function openTaskModal(teamId) {
        document.getElementById('create-task-form').reset();
        document.getElementById('task-team-id').value = teamId; // Set the team_id for the new task
        
        const assignedToSelect = document.getElementById('task-assigned-to');
        assignedToSelect.innerHTML = '<option value="">- Not Assigned -</option>'; // Default option

        try {
            const users = await apiRequest(USER_SERVICE_URL, '/users/public', 'GET', null, localStorage.getItem('token'));
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.username} (${user.first_name} ${user.last_name})`;
                assignedToSelect.appendChild(option);
            });
        } catch (err) {
            console.error("Failed to load users for task assignment:", err);
            showToast('Failed to load users for task assignment.', true);
        }
        
        taskModal.show();
    }

    createTeamBtn.addEventListener("click", () => openCreateEditModal());

    createTeamForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(createTeamForm);
        const data = {
            name: formData.get("name"),
            description: formData.get("description"),
            leader_id: formData.get("leader_id") ? parseInt(formData.get("leader_id")) : null
        };

        try {
            const url = editingTeamId ? `/teams/${editingTeamId}` : '/teams';
            const method = editingTeamId ? 'PUT' : 'POST';
            await apiRequest(TEAM_SERVICE_URL, url, method, data, localStorage.getItem('token'));
            
            showToast(`Team ${editingTeamId ? 'updated' : 'created'} successfully!`);
            teamModal.hide();
            loadTeams();
        } catch (err) {
            showToast(err.error || "Failed to save team", true);
        }
    });

    // Handle task creation form submission
    document.getElementById('create-task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const taskData = {
            title: formData.get('title'),
            description: formData.get('description'),
            status: formData.get('status'),
            priority: formData.get('priority'),
            due_date: formData.get('due_date') || null,
            team_id: parseInt(formData.get('team_id')),
            assigned_to: formData.get('assigned_to') ? parseInt(formData.get('assigned_to')) : null,
        };

        try {
            await apiRequest(TASK_SERVICE_URL, '/tasks', 'POST', taskData, localStorage.getItem('token'));
            showToast('Task created successfully!');
            taskModal.hide();
            // Refresh the team view to show the new task
            // We need to simulate the event object for handleViewTeam
            handleViewTeam({ target: { dataset: { id: currentTeamId } } });
        } catch (err) {
            showToast(err.error || 'Failed to create task', true);
        }
    });

    // Initial load
    loadTeams();
});