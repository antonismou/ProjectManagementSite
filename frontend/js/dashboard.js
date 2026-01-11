document.addEventListener("DOMContentLoaded", async () => {
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

  // Selectors
  const statTotal = document.getElementById("stat-total");
  const statTodo = document.getElementById("stat-todo");
  const statInProgress = document.getElementById("stat-inprogress");
  const statDone = document.getElementById("stat-done");
  const statTeams = document.getElementById("stat-teams"); // New
  const statGlobalTeams = document.getElementById("stat-global-teams"); // New Global Teams

  const colTodo = document.getElementById("col-todo");
  const colInProgress = document.getElementById("col-inprogress");
  const colDone = document.getElementById("col-done");
  const ctx = document.getElementById('tasksChart'); // Chart Canvas

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
      card.className = `card task-card ${priority.border} mb-3`; 
      
      card.innerHTML = `
          <div class="card-body">
              <h5 class="card-title">${task.title}</h5>
              <p class="card-subtitle mb-2 text-muted">Due: ${task.due_date || "-"}</p>
              <div class="d-flex justify-content-between align-items-center">
                  <span class="badge ${priority.bg}">${task.priority}</span>
                  ${task.assigned_to == currentUser.id ? '<span class="badge bg-primary">Assigned to Me</span>' : ''}
              </div>
          </div>
      `;
      
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

    renderChart(todo, inProg, done);
  }

  let myChart = null;
  function renderChart(todo, inProgress, done) {
      if (!ctx) return;
      
      if (myChart) {
          myChart.destroy();
      }

      myChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
              labels: ['To Do', 'In Progress', 'Done'],
              datasets: [{
                  label: '# of Tasks',
                  data: [todo, inProgress, done],
                  backgroundColor: [
                      '#6c757d', // secondary (todo)
                      '#ffc107', // warning (inprogress)
                      '#198754'  // success (done)
                  ],
                  borderWidth: 1
              }]
          },
          options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                  legend: {
                      position: 'bottom',
                  }
              }
          }
      });
  }

  async function loadDashboardData() {
    try {
        console.log("CurrentUser:", currentUser);
        const allTasks = await apiRequest(TASK_SERVICE_URL, "/tasks");
        const teams = await apiRequest(TEAM_SERVICE_URL, '/teams'); // Visible teams for My Teams count
        
        let filteredTasks = [];
        let myTeamsCount = 0;

        // Set Global Teams Count
        if (statGlobalTeams) {
            try {
                const countData = await apiRequest(TEAM_SERVICE_URL, '/teams/count');
                statGlobalTeams.textContent = countData.count;
            } catch (e) {
                console.error("Failed to fetch global team count", e);
                statGlobalTeams.textContent = '-';
            }
        }

        // Calculate My Teams Count (for ALL roles, count only teams where user is leader or member)
        myTeamsCount = teams.filter(t => {
            const isLeader = t.leader_id == currentUser.id;
            // parsing members again...
            let members = [];
            if (typeof t.members === 'string') members = t.members.split(',').map(Number);
            else if (Array.isArray(t.members)) members = t.members.map(Number);
            else if (typeof t.members === 'number') members = [t.members];
            
            const isMember = members.includes(currentUser.id);
            return isLeader || isMember;
        }).length;
        
        if(statTeams) statTeams.textContent = myTeamsCount;


        if (currentUser.role === 'ADMIN') {
            filteredTasks = allTasks;
        } else if (currentUser.role === 'TEAM_LEADER') {
            const myLedTeamIds = teams
                .filter(t => t.leader_id == currentUser.id) 
                .map(t => t.id);
            
            filteredTasks = allTasks.filter(task => {
                const isAssigned = task.assigned_to == currentUser.id;
                const isMyTeamTask = myLedTeamIds.includes(task.team_id);
                return isAssigned || isMyTeamTask;
            });
        } else {
            filteredTasks = allTasks.filter(task => task.assigned_to == currentUser.id);
        }
        
        renderTasks(filteredTasks);

    } catch (err) {
        console.error("Failed to load dashboard data:", err);
        colTodo.innerHTML = '<div class="alert alert-danger">Failed to load data.</div>';
    }
  }

  loadDashboardData();
});