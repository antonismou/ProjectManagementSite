const currentUser = requireAuth();

// selectors
const statTotal = document.getElementById("stat-total");
const statTodo = document.getElementById("stat-todo");
const statInProgress = document.getElementById("stat-inprogress");
const statDone = document.getElementById("stat-done");

const colTodo = document.getElementById("col-todo");
const colInProgress = document.getElementById("col-inprogress");
const colDone = document.getElementById("col-done");

function getPriorityClass(priority) {
    switch (priority) {
        case 'HIGH':
            return { bg: 'bg-danger', border: 'priority-high' };
        case 'MEDIUM':
            return { bg: 'bg-warning', border: 'priority-medium' };
        case 'LOW':
            return { bg: 'bg-success', border: 'priority-low' };
        default:
            return { bg: 'bg-secondary', border: '' };
    }
}

function renderTasks(tasks) {
  colTodo.innerHTML = "";
  colInProgress.innerHTML = "";
  colDone.innerHTML = "";

  let todo = 0, inProg = 0, done = 0;

  tasks.forEach(task => {
    const priority = getPriorityClass(task.priority);
    const card = document.createElement("div");
    card.className = `card task-card ${priority.border}`;
    
    card.innerHTML = `
        <div class="card-body">
            <h5 class="card-title">${task.title}</h5>
            <p class="card-subtitle mb-2 text-muted">Due: ${task.due_date || "-"}</p>
            <span class="badge ${priority.bg}">${task.priority}</span>
        </div>
    `;
    
    // Add click event to go to task page
    card.addEventListener('click', () => {
        window.location.href = `task.html?id=${task.id}`;
    });
    card.style.cursor = 'pointer';


    if (task.status === "TODO") {
      colTodo.appendChild(card);
      todo++;
    } else if (task.status === "IN_PROGRESS") {
      colInProgress.appendChild(card);
      inProg++;
    } else if (task.status === "DONE") {
      colDone.appendChild(card);
      done++;
    }
  });

  statTotal.textContent = tasks.length;
  statTodo.textContent = todo;
  statInProgress.textContent = inProg;
  statDone.textContent = done;
}

document.addEventListener("DOMContentLoaded", async () => {
  const currentUser = requireAuth();
  if (!currentUser) return;

  // Set username in navbar
  const usernameDisplay = document.getElementById('username-display');
  if(usernameDisplay) {
    usernameDisplay.textContent = currentUser.username;
  }

  // Add admin link if user is ADMIN
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

  const token = localStorage.getItem("token");
  try {
    const tasks = await apiRequest(TASK_SERVICE_URL, "/tasks", "GET", null, token);
    renderTasks(tasks);
  } catch (err) {
    console.error("Failed to load tasks:", err);
    // fallback to demo tasks if API fails
    const demoTasks = [
        { id: 1, title: "User Service Setup", status: "TODO", priority: "HIGH", due_date: "2026-01-15" },
        { id: 2, title: "Database Design", status: "IN_PROGRESS", priority: "MEDIUM", due_date: "2026-01-12" },
        { id: 3, title: "Frontend Dashboard", status: "DONE", priority: "LOW", due_date: "2026-01-10" },
        { id: 4, title: "Team Service API", status: "TODO", priority: "MEDIUM", due_date: "2026-01-18" }
    ];
    renderTasks(demoTasks);
  }
});