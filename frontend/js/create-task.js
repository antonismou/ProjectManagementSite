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

    const taskForm = document.getElementById('create-task-form');
    const titleInput = document.getElementById('title');
    const descriptionInput = document.getElementById('description');
    const prioritySelect = document.getElementById('priority');
    const statusSelect = document.getElementById('status');
    const dueDateInput = document.getElementById('due_date');
    const teamSelect = document.getElementById('team_id');
    const assigneeSelect = document.getElementById('assigned_to');
    const toastContainer = document.querySelector('.toast-container');

    // Helper function to show toasts
    function showToast(message, isError = false) {
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

    const urlParams = new URLSearchParams(window.location.search);
    const preselectedTeamId = urlParams.get('teamId');

    // 1. Populate Team Dropdown
    async function populateTeamSelect() {
        try {
            // If teamId is present, we only fetch THAT team to lock it down
            // Otherwise fetch all (though we want to restrict creation to team context usually)
            let teams = [];
            if (preselectedTeamId) {
                const team = await apiRequest(TEAM_SERVICE_URL, `/teams/${preselectedTeamId}`);
                if (team) teams = [team];
            } else {
                // If accessed directly without teamId, maybe allow selecting from teams user leads?
                // For now, let's fetch all but we will enforce permissions later
                teams = await apiRequest(TEAM_SERVICE_URL, '/teams');
            }

            if (teams) {
                teams.forEach(team => {
                    const option = document.createElement('option');
                    option.value = team.id;
                    option.textContent = escapeHtml(team.name);
                    teamSelect.appendChild(option);
                });
            }

            if (preselectedTeamId) {
                teamSelect.value = preselectedTeamId;
                teamSelect.disabled = true; // Lock the team selection
                
                // Security Check: Is user Leader?
                const selectedTeam = teams.find(t => String(t.id) === String(preselectedTeamId));
                if (selectedTeam) {
                    if (selectedTeam.leader_id !== user.id) {
                        alert('Only the Team Leader can create tasks for this team.');
                        window.location.href = `teams.html?id=${preselectedTeamId}`;
                        return;
                    }
                    // Load assignees based on this team
                    await populateAssigneeSelect(selectedTeam);
                }
            } else {
                // If no team pre-selected, verify if user can create for the selected team when changed?
                // But request said "only create from inside the team".
                // So if no teamId, maybe redirect back to teams?
                if (user.role !== 'ADMIN') { // Admin can maybe create freely
                     alert('Please create tasks from the Team details page.');
                     window.location.href = 'teams.html';
                }
            }

        } catch (err) {
            console.error("Failed to fetch teams:", err);
            showToast(`Failed to fetch teams: ${err.error || 'Unknown error'}`, true);
        }
    }

    // 2. Populate Assignee Dropdown (Filtered by Team Members)
    async function populateAssigneeSelect(team) {
        assigneeSelect.innerHTML = '<option value="">-- Unassigned --</option>';
        if (!team || !team.members) return;

        let memberIds = [];
        if (typeof team.members === 'string') memberIds = team.members.split(',').map(Number).filter(Boolean);
        else if (Array.isArray(team.members)) memberIds = team.members.map(Number).filter(Boolean);
        else if (typeof team.members === 'number') memberIds = [team.members];

        if (memberIds.length === 0) return;

        try {
            const users = await apiRequest(USER_SERVICE_URL, '/users?ids=' + memberIds.join(','));
            if (users) {
                users.forEach(u => {
                    const option = document.createElement('option');
                    option.value = u.id;
                    option.textContent = escapeHtml(u.username);
                    assigneeSelect.appendChild(option);
                });
            }
        } catch (err) {
            console.error("Failed to fetch team members:", err);
            showToast(`Failed to fetch team members: ${err.error || 'Unknown error'}`, true);
        }
    }

    // Handle form submission
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = titleInput.value.trim();
        const description = descriptionInput.value.trim();
        const priority = prioritySelect.value;
        const status = statusSelect.value;
        const dueDate = dueDateInput.value || null;
        // Use preselected if disabled, else value
        const teamId = preselectedTeamId ? parseInt(preselectedTeamId) : parseInt(teamSelect.value);
        const assignedTo = assigneeSelect.value ? parseInt(assigneeSelect.value) : null;

        if (!title) {
            showToast('Task title is required.', true);
            return;
        }
        if (!teamId) {
            showToast('Team is required.', true);
            return;
        }

        const taskData = {
            title,
            description,
            priority,
            status,
            due_date: dueDate,
            team_id: teamId,
            assigned_to: assignedTo
        };

        const submitBtn = taskForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Creating...';

        try {
            const newTask = await apiRequest(TASK_SERVICE_URL, '/tasks', 'POST', taskData);
            showToast('Task created successfully!');
            // Redirect back to the team view
            window.location.href = `teams.html?id=${teamId}`; 
        } catch (err) {
            console.error("Failed to create task:", err);
            showToast(`Failed to create task: ${err.error || 'Unknown error'}`, true);
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save me-2"></i> Create Task';
        }
    });

    // Start initialization
    await populateTeamSelect();
});