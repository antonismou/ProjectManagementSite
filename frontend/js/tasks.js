document.addEventListener("DOMContentLoaded", () => {
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

    const tasksList = document.getElementById("tasks-list");
    const noTasksMessage = document.getElementById("no-tasks-message");

    function getPriorityBadge(priority) {
        switch (priority) {
            case 'HIGH': return 'bg-danger';
            case 'MEDIUM': return 'bg-warning text-dark';
            case 'LOW': return 'bg-success';
            default: return 'bg-secondary';
        }
    }

    function renderTasks(tasks) {
        if (!tasksList) return;
        tasksList.innerHTML = "";

        if (tasks.length === 0) {
            noTasksMessage.classList.remove('d-none');
        } else {
            noTasksMessage.classList.add('d-none');
        }

        tasks.forEach(task => {
            const row = document.createElement("tr");
            row.style.cursor = "pointer";
            row.addEventListener('click', () => {
                window.location.href = `task.html?id=${task.id}`;
            });

            row.innerHTML = `
                <td>${task.title}</td>
                <td><span class="badge ${getPriorityBadge(task.priority)}">${task.priority}</span></td>
                <td>${task.status}</td>
                <td>${task.due_date}</td>
                <td>${task.team_id}</td>
            `;
            tasksList.appendChild(row);
        });
    }

    async function loadTasks() {
        const token = localStorage.getItem("token");
        tasksList.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';
        try {
            const tasks = await apiRequest(TASK_SERVICE_URL, "/tasks", "GET", null, token);
            const uid = Number(currentUser.id);
            const myTasks = (tasks || []).filter(t => Number(t.assigned_to) === uid || Number(t.created_by) === uid);
            renderTasks(myTasks);
        } catch (err) {
            console.error("Failed to load tasks:", err);
            tasksList.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Failed to load tasks.</td></tr>';
        }
    }

    loadTasks();
});
