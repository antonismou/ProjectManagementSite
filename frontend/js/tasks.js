console.log("tasks.js loaded");

// Keep all DOM lookups and event wiring inside a single DOMContentLoaded handler
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded");

  const currentUser = requireAuth();
  console.log("Current user:", currentUser);
  if (!currentUser) return;

  // DOM elements
  const tasksList = document.getElementById("tasks-list");
  const taskModal = document.getElementById("task-modal");
  const createTaskForm = document.getElementById("create-task-form");
  const createTaskBtn = document.getElementById("create-task-btn");
  const closeModalBtn = document.getElementById("close-modal");

  function renderTasks(tasks) {
    if (!tasksList) return;
    tasksList.innerHTML = "";
    tasks.forEach(task => {
      const taskCard = document.createElement("div");
      taskCard.className = "task-card";
      taskCard.innerHTML = `
        <h3>${task.title}</h3>
        <p>${task.description || task.status}</p>
        <div class="task-meta">
          <span>Priority: ${task.priority}</span>
          <span>Due: ${task.due_date}</span>
          <span>Team ID: ${task.team_id}</span>
        </div>
      `;
      tasksList.appendChild(taskCard);
    });
  }

  async function loadTasks() {
    const token = localStorage.getItem("token");
    try {
      const tasks = await apiRequest(TASK_SERVICE_URL, "/tasks", "GET", null, token);
      // show only tasks assigned to or created by the current user
      const uid = Number(currentUser && currentUser.id);
      const myTasks = (tasks || []).filter(t => Number(t.assigned_to) === uid || Number(t.created_by) === uid);
      renderTasks(myTasks);
    } catch (err) {
      console.error("Failed to load tasks:", err);
    }
  }

  if (createTaskBtn) {
    createTaskBtn.addEventListener("click", () => {
      if (taskModal) taskModal.classList.remove("hidden");
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      if (taskModal) taskModal.classList.add("hidden");
    });
  }

  if (createTaskForm) {
    createTaskForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(createTaskForm);
      const data = {
        title: formData.get("title"),
        priority: formData.get("priority"),
        due_date: formData.get("due_date"),
        team_id: formData.get("team_id") || 1,
        description: formData.get("description") || null,
        assigned_to: formData.get("assigned_to") || null
      };

      const token = localStorage.getItem("token");
      try {
        await apiRequest(TASK_SERVICE_URL, "/tasks", "POST", data, token);
        alert("Εργασία δημιουργήθηκε!");
        createTaskForm.reset();
        if (taskModal) taskModal.classList.add("hidden");
        loadTasks();  // refresh
      } catch (err) {
        alert(err.error || "Failed to create task");
      }
    });
  }

  // initial load
  loadTasks();

});
