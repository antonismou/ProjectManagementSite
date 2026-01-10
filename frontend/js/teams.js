// teams.js - implemented with a single DOMContentLoaded handler to avoid redeclarations
document.addEventListener("DOMContentLoaded", () => {
  console.log("teams.js loaded");

  const currentUser = requireAuth();
  if (!currentUser) return;

  const teamsList = document.getElementById("teams-list");
  const teamModal = document.getElementById("team-modal");
  const createTeamForm = document.getElementById("create-team-form");
  const createTeamBtn = document.getElementById("create-team-btn");
  const closeModalBtn = document.getElementById("close-modal");

  let editingTeamId = null;

  // hide create button for non-admins
  try {
    if (!(currentUser && currentUser.role === 'ADMIN')) {
      if (createTeamBtn) createTeamBtn.classList.add('hidden');
    }
  } catch (e) { /* ignore */ }

  async function loadTeams() {
    const token = localStorage.getItem("token");
    try {
      const teams = await apiRequest(TEAM_SERVICE_URL, "/teams", "GET", null, token);
      renderTeams(teams);
    } catch (err) {
      console.error("Failed to load teams:", err);
    }
  }

  function renderTeams(teams) {
    teamsList.innerHTML = "";
    teams.forEach(team => {
      const teamCard = document.createElement("div");
      teamCard.className = "team-card";

      // determine permissions for current user (refresh from localStorage)
      let lu = null;
      try { lu = JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) { lu = null; }
  const canEdit = lu && (lu.role === 'ADMIN' || (lu.role === 'TEAM_LEADER' && Number(lu.id) === Number(team.leader_id)));
  const canDelete = lu && lu.role === 'ADMIN';
  const canManageMembers = lu && (lu.role === 'TEAM_LEADER' && Number(lu.id) === Number(team.leader_id));

      teamCard.innerHTML = `
        <h3>${team.name}</h3>
        <p>${team.description}</p>
        <div class="team-meta">
          <span>Leader ID: ${team.leader_id || '-'}</span>
          <span>${(team.members && team.members.length) ? team.members.length : 0} μέλη</span>
        </div>
        <div style="margin-top:0.6rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
          <button class="view-team" data-id="${team.id}">View</button>
          ${canManageMembers ? `<button class="add-member" data-id="${team.id}">Add Member</button><button class="manage-members" data-id="${team.id}">Manage Members</button>` : ''}
          ${canEdit ? `<button class="edit-team" data-id="${team.id}">Edit</button>` : ''}
          ${canDelete ? `<button class="delete-team" data-id="${team.id}">Delete</button>` : ''}
        </div>
      `;

      teamsList.appendChild(teamCard);

      if (canEdit) {
        const editBtn = teamCard.querySelector('.edit-team');
        if (editBtn) editBtn.addEventListener('click', () => openEditModal(team));
      }

        // view handler (everyone can view)
        const viewBtn = teamCard.querySelector('.view-team');
        if (viewBtn) {
          viewBtn.addEventListener('click', async () => {
            const id = viewBtn.dataset.id;
            try {
              const token = localStorage.getItem('token');
              const teamDetail = await apiRequest(TEAM_SERVICE_URL, `/teams/${id}`, 'GET', null, token);
              openViewModal(teamDetail);
            } catch (err) {
              alert(err.error || 'Failed to load team details');
            }
          });
        }

        // add member handler (prompt for id(s))
        const addBtn = teamCard.querySelector('.add-member');
        if (addBtn) {
          addBtn.addEventListener('click', async () => {
            const id = addBtn.dataset.id;
            const raw = prompt('Enter member id(s) to add (comma separated):');
            if (!raw) return;
            const ids = raw.split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
            if (!ids.length) { alert('No valid ids provided'); return; }
            try {
              const token = localStorage.getItem('token');
              // fetch current team
              const teamDetail = await apiRequest(TEAM_SERVICE_URL, `/teams/${id}`, 'GET', null, token);
              const existing = (teamDetail.members || []).map(m => m.id);
              const merged = Array.from(new Set(existing.concat(ids)));
              await apiRequest(TEAM_SERVICE_URL, `/teams/${id}`, 'PUT', { members: merged }, token);
              alert('Members added');
              loadTeams();
            } catch (err) {
              alert(err.error || 'Failed to add members');
            }
          });
        }

        // manage/remove members handler
        const manageBtn = teamCard.querySelector('.manage-members');
        if (manageBtn) {
          manageBtn.addEventListener('click', async () => {
            const id = manageBtn.dataset.id;
            try {
              const token = localStorage.getItem('token');
              const teamDetail = await apiRequest(TEAM_SERVICE_URL, `/teams/${id}`, 'GET', null, token);
              openMembersModal(teamDetail);
            } catch (err) {
              alert(err.error || 'Failed to load team members');
            }
          });
        }

      if (canDelete) {
        const delBtn = teamCard.querySelector('.delete-team');
        if (delBtn) {
          delBtn.addEventListener('click', async () => {
            if (!confirm(`Delete team ${team.name}? This cannot be undone.`)) return;
            try {
              const token = localStorage.getItem('token');
              await apiRequest(TEAM_SERVICE_URL, `/teams/${team.id}`, 'DELETE', null, token);
              alert('Team deleted');
              loadTeams();
            } catch (err) {
              alert(err.error || 'Failed to delete team');
            }
          });
        }
      }
    });
  }

  if (createTeamBtn) {
    createTeamBtn.addEventListener("click", () => {
      editingTeamId = null;
      const title = document.querySelector('#team-modal h3');
      if (title) title.textContent = 'Δημιουργία Ομάδας';
      const submitBtn = createTeamForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.textContent = 'Δημιουργία';
      createTeamForm.reset();
      teamModal.classList.remove("hidden");
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      teamModal.classList.add("hidden");
      editingTeamId = null;
    });
  }

  if (createTeamForm) {
    createTeamForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(createTeamForm);
      const name = formData.get("name");
      const description = formData.get("description");
      const leader_id_raw = formData.get("leader_id");

      const data = { name, description };
      if (leader_id_raw) {
        const lid = Number(leader_id_raw);
        if (!Number.isNaN(lid)) data.leader_id = lid;
      }

      const token = localStorage.getItem("token");
      try {
        if (editingTeamId) {
          await apiRequest(TEAM_SERVICE_URL, `/teams/${editingTeamId}`, "PUT", data, token);
          alert("Ομάδα ενημερώθηκε!");
        } else {
          await apiRequest(TEAM_SERVICE_URL, "/teams", "POST", data, token);
          alert("Ομάδα δημιουργήθηκε!");
        }
        createTeamForm.reset();
        teamModal.classList.add("hidden");
        loadTeams();
        editingTeamId = null;
      } catch (err) {
        alert(err.error || "Failed to save team");
      }
    });
  }

  function openEditModal(team) {
    if (!team) return;
    editingTeamId = team.id;
    const title = document.querySelector('#team-modal h3');
    if (title) title.textContent = 'Επεξεργασία Ομάδας';
    const submitBtn = createTeamForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Αποθήκευση';
    createTeamForm.querySelector('input[name="name"]').value = team.name || '';
    createTeamForm.querySelector('textarea[name="description"]').value = team.description || '';
    // populate leader_id field if present
    const leaderInput = createTeamForm.querySelector('input[name="leader_id"]');
    if (leaderInput) leaderInput.value = team.leader_id || '';
    // members are managed via the dedicated members modal
    teamModal.classList.remove('hidden');
  }

  // members modal - show list and allow removal
  const teamMembersModal = document.getElementById('team-members-modal');
  const teamMembersContent = document.getElementById('team-members-content');
  const closeMembersModalBtn = document.getElementById('close-members-modal');

  function openMembersModal(team) {
    if (!team) return;
    let html = `<div><strong>${team.name}</strong></div>`;
    html += `<div style="margin-top:0.5rem">${team.description || ''}</div>`;
    html += `<hr>`;
    html += `<div style="margin-top:0.6rem"><strong>Members</strong></div>`;
    if (team.members && team.members.length) {
      html += `<ul class="member-list">`;
      team.members.forEach(m => {
        html += `<li class="member-row">${m.first_name || ''} ${m.last_name || ''} (${m.username} | id:${m.id}) - ${m.email || ''} ${m.active ? '' : '<span style="color:#c00">(inactive)</span>'} <button class="remove-member" data-team="${team.id}" data-member="${m.id}">Remove</button></li>`;
      });
      html += `</ul>`;
    } else {
      html += `<div>No members</div>`;
    }

    // add quick add-by-id form
    html += `<div style="margin-top:0.8rem"><label>Add member by ID: <input id="add-member-id" type="number" placeholder="user id"></label> <button id="add-member-confirm" data-team="${team.id}">Add</button></div>`;

    teamMembersContent.innerHTML = html;
    if (teamMembersModal) teamMembersModal.classList.remove('hidden');

    // wire remove buttons
    const removeBtns = teamMembersContent.querySelectorAll('.remove-member');
    removeBtns.forEach(btn => btn.addEventListener('click', async (e) => {
      const teamId = btn.dataset.team;
      const memberId = Number(btn.dataset.member);
      if (!confirm('Remove this member from the team?')) return;
      try {
        const token = localStorage.getItem('token');
        // fetch current team members
        const teamDetail = await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'GET', null, token);
        const existing = (teamDetail.members || []).map(m => m.id).filter(id => id !== memberId);
        await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'PUT', { members: existing }, token);
        alert('Member removed');
        // refresh modal
        const refreshed = await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'GET', null, token);
        openMembersModal(refreshed);
        loadTeams();
      } catch (err) {
        alert(err.error || 'Failed to remove member');
      }
    }));

    const addConfirm = teamMembersContent.querySelector('#add-member-confirm');
    if (addConfirm) {
      addConfirm.addEventListener('click', async () => {
        const teamId = addConfirm.dataset.team;
        const input = teamMembersContent.querySelector('#add-member-id');
        if (!input) return;
        const raw = input.value;
        const idToAdd = Number(raw);
        if (Number.isNaN(idToAdd)) { alert('Invalid id'); return; }
        try {
          const token = localStorage.getItem('token');
          const teamDetail = await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'GET', null, token);
          const existing = (teamDetail.members || []).map(m => m.id);
          if (existing.includes(idToAdd)) { alert('User already a member'); return; }
          const merged = Array.from(new Set(existing.concat([idToAdd])));
          await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'PUT', { members: merged }, token);
          alert('Member added');
          const refreshed = await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'GET', null, token);
          openMembersModal(refreshed);
          loadTeams();
        } catch (err) {
          alert(err.error || 'Failed to add member');
        }
      });
    }
  }

  if (closeMembersModalBtn) {
    closeMembersModalBtn.addEventListener('click', () => {
      if (teamMembersModal) teamMembersModal.classList.add('hidden');
    });
  }

  // view modal
  const teamViewModal = document.getElementById('team-view-modal');
  const teamViewContent = document.getElementById('team-view-content');
  const closeViewModalBtn = document.getElementById('close-view-modal');

  function openViewModal(team) {
    if (!team) return;
    // build HTML with leader, members and tasks; include create form for team leader
    const rawUser = localStorage.getItem('user');
    let currentUser = null;
    try { currentUser = rawUser ? JSON.parse(rawUser) : null; } catch (e) { currentUser = null; }

    let html = `<div><strong>${team.name}</strong></div>`;
    html += `<div style="margin-top:0.5rem">${team.description || ''}</div>`;
    html += `<hr>`;
    if (team.leader) {
      html += `<div><strong>Leader</strong></div>`;
      html += `<div class="member-row">${team.leader.first_name || ''} ${team.leader.last_name || ''} (${team.leader.username} | id:${team.leader.id}) - ${team.leader.email || ''}</div>`;
    } else if (team.leader_id) {
      html += `<div><strong>Leader ID:</strong> ${team.leader_id}</div>`;
    }
    html += `<div style="margin-top:0.6rem"><strong>Members</strong></div>`;
    if (team.members && team.members.length) {
      html += `<ul class="member-list">`;
      team.members.forEach(m => {
        html += `<li class="member-row">${m.first_name || ''} ${m.last_name || ''} (${m.username} | id:${m.id}) - ${m.email || ''} ${m.active ? '' : '<span style="color:#c00">(inactive)</span>'}</li>`;
      });
      html += `</ul>`;
    } else {
      html += `<div>No members</div>`;
    }

    // placeholder for tasks list and create form
    html += `<hr><div style="margin-top:0.6rem"><strong>Team Tasks</strong></div>`;
    html += `<div id="team-tasks-list">Φόρτωση...</div>`;

    // if current user is the team leader, show create form
    const isLeader = currentUser && currentUser.role === 'TEAM_LEADER' && Number(currentUser.id) === Number(team.leader_id);
    if (isLeader) {
      html += `<div style="margin-top:0.8rem" id="team-create-task">`;
      html += `<h4>Δημιουργία Εργασίας για αυτή την ομάδα</h4>`;
      html += `<form id="team-create-task-form">
        <input name="title" placeholder="Τίτλος" required>
        <textarea name="description" placeholder="Περιγραφή"></textarea>
        <label>Priority: <select name="priority"><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label>
        <label>Due date: <input type="date" name="due_date" required></label>
        <label>Assign to (user id): <input type="number" name="assigned_to"></label>
        <input type="hidden" name="team_id" value="${team.id}">
        <div style="margin-top:0.5rem"><button type="submit">Δημιουργία</button></div>
      </form>`;
      html += `</div>`;
    }

    teamViewContent.innerHTML = html;
    if (teamViewModal) teamViewModal.classList.remove('hidden');

    // load team tasks
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const tasks = await apiRequest(TASK_SERVICE_URL, '/tasks', 'GET', null, token);
        const teamTasks = (tasks || []).filter(t => Number(t.team_id) === Number(team.id));
        const tasksContainer = document.getElementById('team-tasks-list');
        if (!tasksContainer) return;
        if (!teamTasks.length) {
          tasksContainer.innerHTML = `<div>No tasks for this team</div>`;
        } else {
          let thtml = '';
          teamTasks.forEach(t => {
            thtml += `<div class="task-card"><h4><a href="task.html?id=${t.id}">${t.title}</a></h4><div>${t.description || ''}</div><div class="task-meta"><span>Priority: ${t.priority}</span> <span>Due: ${t.due_date}</span> <span>Assigned: ${t.assigned_to || '-'}</span></div></div>`;
          });
          tasksContainer.innerHTML = thtml;
        }
      } catch (err) {
        const tasksContainer = document.getElementById('team-tasks-list');
        if (tasksContainer) tasksContainer.innerHTML = `<div>Failed to load tasks</div>`;
      }
    })();

    // wire create form if present
    if (isLeader) {
      const createForm = document.getElementById('team-create-task-form');
      if (createForm) {
        createForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(createForm);
          const payload = {
            title: fd.get('title'),
            description: fd.get('description') || null,
            priority: fd.get('priority') || 'MEDIUM',
            due_date: fd.get('due_date'),
            team_id: Number(fd.get('team_id')),
            assigned_to: fd.get('assigned_to') ? Number(fd.get('assigned_to')) : null
          };
          try {
            const token = localStorage.getItem('token');
            await apiRequest(TASK_SERVICE_URL, '/tasks', 'POST', payload, token);
            alert('Task created');
            // refresh tasks list
            const tasks = await apiRequest(TASK_SERVICE_URL, '/tasks', 'GET', null, token);
            const teamTasks = (tasks || []).filter(t => Number(t.team_id) === Number(team.id));
            const tasksContainer = document.getElementById('team-tasks-list');
            if (teamTasks.length) {
              let thtml = '';
              teamTasks.forEach(t => {
                thtml += `<div class="task-card"><h4>${t.title}</h4><div>${t.description || ''}</div><div class="task-meta"><span>Priority: ${t.priority}</span> <span>Due: ${t.due_date}</span> <span>Assigned: ${t.assigned_to || '-'}</span></div></div>`;
              });
              tasksContainer.innerHTML = thtml;
            } else {
              tasksContainer.innerHTML = `<div>No tasks for this team</div>`;
            }
            createForm.reset();
          } catch (err) {
            alert(err.error || 'Failed to create task');
          }
        });
      }
    }
  }

  if (closeViewModalBtn) {
    closeViewModalBtn.addEventListener('click', () => {
      if (teamViewModal) teamViewModal.classList.add('hidden');
    });
  }

  // initial load
  loadTeams();

  // expose for debugging if needed
  window.loadTeams = loadTeams;
});

