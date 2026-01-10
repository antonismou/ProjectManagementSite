function logout() {
  console.log("Logout function called");
  localStorage.clear();
  window.location.href = "index.html";
}

const currentUser = requireAuth();

// selectors
const statTotal = document.getElementById("stat-total");
const statTodo = document.getElementById("stat-todo");
const statInProgress = document.getElementById("stat-inprogress");
const statDone = document.getElementById("stat-done");

const colTodo = document.getElementById("col-todo");
const colInProgress = document.getElementById("col-inprogress");
const colDone = document.getElementById("col-done");


// demo tasks – αργότερα θα έρχονται από TASK_SERVICE_URL
const demoTasks = [
  { id: 1, title: "Στήσιμο User Service", status: "TODO", priority: "HIGH", due_date: "2026-01-15" },
  { id: 2, title: "Σχεδιασμός DB", status: "IN_PROGRESS", priority: "MEDIUM", due_date: "2026-01-12" },
  { id: 3, title: "Frontend Dashboard", status: "DONE", priority: "LOW", due_date: "2026-01-10" },
  { id: 4, title: "Team Service API", status: "TODO", priority: "MEDIUM", due_date: "2026-01-18" }
];

function renderTasks(tasks) {
  colTodo.innerHTML = "";
  colInProgress.innerHTML = "";
  colDone.innerHTML = "";

  let todo = 0, inProg = 0, done = 0;

  tasks.forEach(task => {
    const card = document.createElement("div");
    card.className = "task-card";

    const title = document.createElement("h4");
    title.textContent = task.title;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `Due: ${task.due_date || "-"}`;

    const prioritySpan = document.createElement("span");
    prioritySpan.className = "badge-priority " +
      (task.priority === "HIGH" ? "priority-high"
        : task.priority === "LOW" ? "priority-low"
        : "priority-medium");
    prioritySpan.textContent = task.priority;

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(prioritySpan);

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

  const token = localStorage.getItem("token");
  try {
    // τώρα φέρνει από Task Service
    const tasks = await apiRequest(TASK_SERVICE_URL, "/tasks", "GET", null, token);
    renderTasks(tasks);
  } catch (err) {
    console.error("Failed to load tasks:", err);
    // fallback στα demo tasks
    renderTasks(demoTasks);
  }
});
