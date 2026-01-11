document.addEventListener('DOMContentLoaded', () => {
    const user = requireAuth(); // Assumes requireAuth function is available
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

    const tasksListTbody = document.getElementById("tasks-list");
    const noTasksMessage = document.getElementById("no-tasks-message");
    const createTaskBtn = document.getElementById('create-task-btn');

    // Helper functions assumed to be available from api.js and session.js
    // const apiRequest = require('./api.js').apiRequest; // Example
    // const TASK_SERVICE_URL = "http://localhost:8082"; // Example
    // const TEAM_SERVICE_URL = "http://localhost:8081"; // Example
    // const USER_SERVICE_URL = "http://localhost:8080"; // Example

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
    
    // Helper to escape HTML entities
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
    
    // Helper to format date for display
    function formatDate(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString(); // e.g., 1/1/2026
        } catch (e) {
            console.error("Error formatting date:", dateString, e);
            return dateString;
        }
    }

    function renderTasks(tasks) {
        tasksListTbody.innerHTML = ""; // Clear existing list

        if (!tasks || tasks.length === 0) {
            noTasksMessage.classList.remove('d-none');
            return;
        } else {
            noTasksMessage.classList.add('d-none');
        }

        tasks.forEach(task => {
            const row = document.createElement("tr");
            
            // Allow row click to navigate, except for the status dropdown
            row.addEventListener('click', (e) => {
                // if the click target is the select or an option, do nothing
                if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') {
                    return;
                }
                window.location.href = `task.html?id=${task.id}`;
            });
            row.style.cursor = "pointer";

            row.innerHTML = `
                <td>${escapeHtml(task.title || 'Untitled Task')}</td>
                <td>${escapeHtml(task.description ? task.description.substring(0, 50) + (task.description.length > 50 ? '...' : '') : 'No description')}</td>
                <td>
                    <select class="form-select form-select-sm status-dropdown" data-task-id="${task.id}">
                        <option value="TODO" ${task.status === 'TODO' ? 'selected' : ''}>To Do</option>
                        <option value="IN_PROGRESS" ${task.status === 'IN_PROGRESS' ? 'selected' : ''}>In Progress</option>
                        <option value="DONE" ${task.status === 'DONE' ? 'selected' : ''}>Done</option>
                    </select>
                </td>
                <td><span class="badge ${getPriorityBadgeClass(task.priority)}">${task.priority || 'N/A'}</span></td>
                <td>${formatDate(task.due_date)}</td>
                <td>${task.team_details ? escapeHtml(task.team_details.name) : '-'}</td>
                <td>${task.assigned_to_details ? escapeHtml(task.assigned_to_details.username) : '-'}</td>
                <td>${task.created_by_details ? escapeHtml(task.created_by_details.username) : '-'}</td>
                <td>${formatDate(task.created_at)}</td>
            `;
            tasksListTbody.appendChild(row);
        });

        // Add event listeners to all status dropdowns
        document.querySelectorAll('.status-dropdown').forEach(dropdown => {
            dropdown.addEventListener('change', handleStatusChange);
        });
    }

    async function handleStatusChange(e) {
        const selectEl = e.target;
        const taskId = selectEl.dataset.taskId;
        const newStatus = selectEl.value;

        selectEl.disabled = true; // Prevent further changes

        try {
            await apiRequest(TASK_SERVICE_URL, `/tasks/${taskId}`, 'PUT', { status: newStatus });
            showToast(`Task #${taskId} status updated to ${newStatus}.`);
        } catch (err) {
            console.error("Failed to update status:", err);
            showToast(`Failed to update status: ${err.error || 'Unknown error'}`, true);
            // Revert on failure
            loadTasks(); 
        } finally {
            selectEl.disabled = false;
        }
    }

    async function loadTasks() {
        tasksListTbody.innerHTML = '<tr><td colspan="9" class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Loading tasks...</td></tr>';
        try {
            const tasks = await apiRequest(TASK_SERVICE_URL, "/tasks");
            
            // Enrich tasks with user and team details
            const userIds = new Set();
            const teamIds = new Set();
            if(tasks) {
                tasks.forEach(task => {
                    if (task.created_by) userIds.add(task.created_by);
                    if (task.assigned_to) userIds.add(task.assigned_to);
                    if (task.team_id) teamIds.add(task.team_id);
                });
            }
            
            const userMap = await fetchUserDetails(Array.from(userIds));
            const teamMap = await fetchTeamDetails(Array.from(teamIds));

            if(tasks) {
                tasks.forEach(task => {
                    task.created_by_details = userMap.get(task.created_by);
                    task.assigned_to_details = userMap.get(task.assigned_to);
                    task.team_details = teamMap.get(task.team_id);
                });
            }

            // Filter: Member sees ONLY tasks assigned to them
            const myTasks = (tasks || []).filter(task => task.assigned_to == user.id);

            renderTasks(myTasks);
        } catch (err) {
            console.error("Failed to load tasks:", err);
            tasksListTbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Failed to load tasks.</td></tr>';
            showToast(`Failed to load tasks: ${err.error || 'Unknown error'}`, true);
        }
    }
    
    // Fetch details for multiple users
    async function fetchUserDetails(userIds) {
        if (!userIds || userIds.length === 0) return new Map();
        try {
            const users = await apiRequest(USER_SERVICE_URL, '/users?ids=' + userIds.join(',')) || []; // Assuming /users endpoint exists
            return new Map(users.map(user => [user.id, user]));
        } catch (err) {
            console.error("Failed to fetch user details:", err);
            showToast(`Failed to fetch user details: ${err.error || 'Unknown error'}`, true);
            return new Map();
        }
    }
    
    // Fetch details for multiple teams
    async function fetchTeamDetails(teamIds) {
        if (!teamIds || teamIds.length === 0) return new Map();
        try {
            const teams = await apiRequest(TEAM_SERVICE_URL, '/teams?ids=' + teamIds.join(','));
            return new Map(teams.map(team => [team.id, team]));
        } catch (err) {
            console.error("Failed to fetch team details:", err);
            showToast(`Failed to fetch team details: ${err.error || 'Unknown error'}`, true);
            return new Map();
        }
    }

    // Initial load
    loadTasks();
});

// Placeholder definitions for required functions/variables
/*
function requireAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    try {
        // Assuming JWT payload contains user_id, username, role
        const payload = JSON.parse(atob(token.split('.')[1]));
        return {
            id: payload.user_id,
            username: payload.username,
            role: payload.role
        };
    } catch (e) {
        console.error("Error decoding token:", e);
        window.location.href = 'login.html';
        return null;
    }
}

// Basic apiRequest (needs to be properly defined in api.js)
async function apiRequest(urlOrEndpoint, method = 'GET', body = null, customHeaders = {}) {
    // Determine if it's a full URL or an endpoint relative to a service
    let url;
    if (urlOrEndpoint.startsWith('http')) {
        url = urlOrEndpoint;
    } else {
        // Assume default service URL if not a full URL
        let baseUrl = TASK_SERVICE_URL; // Default to task service
        if (urlOrEndpoint.startsWith('/users')) baseUrl = USER_SERVICE_URL;
        if (urlOrEndpoint.startsWith('/teams')) baseUrl = TEAM_SERVICE_URL;
        
        url = baseUrl.endsWith('/') ? `${baseUrl}${urlOrEndpoint.substring(1)}` : `${baseUrl}/${urlOrEndpoint}`;
    }

    const headers = { ...customHeaders };
    const token = localStorage.getItem('token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const user = requireAuth();
    if (user) {
        headers['X-User-Id'] = String(user.id);
        headers['X-User-Role'] = user.role;
    }

    const options = {
        method,
        headers,
    };

    if (body && !(body instanceof FormData)) {
        options.body = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
    } else if (body instanceof FormData) {
        // Content-Type is set by browser for FormData
    } else if (body === null && method !== 'GET' && method !== 'DELETE') {
        // Handle cases where POST/PUT might have null body, though typically they expect one
        // For this context, assuming body is either object, FormData, or null where not needed
    }
    
    // For GET and DELETE, body is usually null.
    if (method === 'GET' || method === 'DELETE') {
        // If query params are needed for GET, they should be appended to 'url' before calling apiRequest
        // Or handled within apiRequest if 'body' is used for query params in GET (not standard)
        // For now, assume query params are already part of the url if needed.
    }


    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            throw errorData;
        }
        if (response.status === 204) return null; // No content
        return await response.json();
    } catch (error) {
        console.error(`API Request failed: ${method} ${url}`, error);
        throw error;
    }
}

const TASK_SERVICE_URL = "http://localhost:8082"; // Default, adjust if needed
const TEAM_SERVICE_URL = "http://localhost:8081"; // Default, adjust if needed

function logout() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}
*/
