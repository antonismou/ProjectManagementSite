
console.log("teams.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded");

  const currentUser = requireAuth();
  console.log("Current user:", currentUser);

  if (!currentUser) {
    return;
  }

  loadTeams();
});

//const TEAM_SERVICE_URL = "http://localhost:8081";
const teamsList = document.getElementById("teams-list");
const teamModal = document.getElementById("team-modal");
const createTeamForm = document.getElementById("create-team-form");
const createTeamBtn = document.getElementById("create-team-btn");
const closeModalBtn = document.getElementById("close-modal");

function renderTeams(teams) {
  teamsList.innerHTML = "";
  teams.forEach(team => {
    const teamCard = document.createElement("div");
    teamCard.className = "team-card";
    teamCard.innerHTML = `
      <h3>${team.name}</h3>
      <p>${team.description}</p>
      <div class="team-meta">
        <span>Leader ID: ${team.leader_id}</span>
        <span>${team.members.length} μέλη</span>
      </div>
    `;
    teamsList.appendChild(teamCard);
  });
}

async function loadTeams() {
  const token = localStorage.getItem("token");
  try {
    const teams = await apiRequest(TEAM_SERVICE_URL, "/teams", "GET", null, token);
    renderTeams(teams);
  } catch (err) {
    console.error("Failed to load teams:", err);
  }
}

if (createTeamBtn) {
  createTeamBtn.addEventListener("click", () => {
    teamModal.classList.remove("hidden");
  });
}

if (closeModalBtn) {
  closeModalBtn.addEventListener("click", () => {
    teamModal.classList.add("hidden");
  });
}

if (createTeamForm) {
  createTeamForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(createTeamForm);
    const data = {
      name: formData.get("name"),
      description: formData.get("description")
    };

    const token = localStorage.getItem("token");
    try {
      await apiRequest(TEAM_SERVICE_URL, "/teams", "POST", data, token);
      alert("Ομάδα δημιουργήθηκε!");
      createTeamForm.reset();
      teamModal.classList.add("hidden");
      loadTeams();  // refresh list
    } catch (err) {
      alert(err.error || "Failed to create team");
    }
  });
}

// Load teams on page load
document.addEventListener("DOMContentLoaded", loadTeams);
