document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAuth(); // Assume requireAuth checks token and returns user object or redirects
    if (!user) return;

    // Navbar setup
    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay) usernameDisplay.textContent = user.username;
    
    // Dynamically show Admin link if user is admin
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

    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('id');
    if (!taskId) {
        document.getElementById('task-content').innerHTML = '<div class="alert alert-danger">Task ID is missing.</div>';
        return;
    }

    const taskContentDiv = document.getElementById('task-content');
    const commentsDiv = document.getElementById('comments');
    const attachmentsDiv = document.getElementById('attachments');
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
            return dateString; // Return original if parsing fails
        }
    }
    
    // Helper to format datetime for display
    function formatDateTime(dateTimeString) {
        if (!dateTimeString) return '-';
        try {
            const date = new Date(dateTimeString);
            return date.toLocaleString(); // e.g., 1/1/2026, 10:00:00 AM
        } catch (e) {
            console.error("Error formatting datetime:", dateTimeString, e);
            return dateTimeString; // Return original if parsing fails
        }
    }

    // Fetch and render task details
    async function loadTask() {
        try {
            const task = await apiRequest(TASK_SERVICE_URL, `/tasks/${taskId}`, 'GET');
            renderTaskDetails(task);
            renderComments(task.comments || []);
            renderAttachments(task.attachments || []);
        } catch (err) {
            console.error("Failed to load task:", err);
            taskContentDiv.innerHTML = `<div class="alert alert-danger">Failed to load task details. Error: ${err.error || 'Unknown error'}</div>`;
        }
    }

    function renderTaskDetails(task) {
        let statusBadge = `<span class="badge bg-secondary">${task.status || 'N/A'}</span>`;
        if (task.status === 'IN_PROGRESS') statusBadge = `<span class="badge bg-warning text-dark">${task.status}</span>`;
        if (task.status === 'DONE') statusBadge = `<span class="badge bg-success">${task.status}</span>`;

        let priorityBadge = `<span class="badge bg-secondary">${task.priority || 'N/A'}</span>`;
        if (task.priority === 'HIGH') priorityBadge = `<span class="badge bg-danger">${task.priority}</span>`;
        if (task.priority === 'MEDIUM') priorityBadge = `<span class="badge bg-warning text-dark">${task.priority}</span>`;
        if (task.priority === 'LOW') priorityBadge = `<span class="badge bg-success">${task.priority}</span>`;
        
        const isAdmin = user.role === 'ADMIN';
        const isLeader = user.role === 'TEAM_LEADER' && task.team_details && task.team_details.leader_id === user.id;
        const isAssignee = task.assigned_to === user.id;
        const isCreator = task.created_by === user.id;

        // --- Edit Form Generation ---
        let editFormHtml = '';

        if (isLeader) {
            // FULL EDIT FORM (Leader ONLY)
            editFormHtml = `
                <div class="card mt-4 shadow-sm">
                    <div class="card-header bg-light">
                        <h5 class="mb-0"><i class="fas fa-edit me-2"></i> Edit Task</h5>
                    </div>
                    <div class="card-body">
                        <form id="edit-task-form">
                            <div class="mb-3">
                                <label for="title" class="form-label">Title</label>
                                <input class="form-control" name="title" value="${escapeHtml(task.title || '')}" required>
                            </div>
                            <div class="mb-3">
                                <label for="description" class="form-label">Description</label>
                                <textarea class="form-control" name="description" rows="3">${escapeHtml(task.description || '')}</textarea>
                            </div>
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <label for="priority" class="form-label">Priority</label>
                                    <select class="form-select" name="priority">
                                        <option value="LOW" ${task.priority === 'LOW' ? 'selected' : ''}>Low</option>
                                        <option value="MEDIUM" ${task.priority === 'MEDIUM' ? 'selected' : ''}>Medium</option>
                                        <option value="HIGH" ${task.priority === 'HIGH' ? 'selected' : ''}>High</option>
                                    </select>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label for="status" class="form-label">Status</label>
                                    <select class="form-select" name="status">
                                        <option value="TODO" ${task.status === 'TODO' ? 'selected' : ''}>To Do</option>
                                        <option value="IN_PROGRESS" ${task.status === 'IN_PROGRESS' ? 'selected' : ''}>In Progress</option>
                                        <option value="DONE" ${task.status === 'DONE' ? 'selected' : ''}>Done</option>
                                    </select>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label for="due_date" class="form-label">Due Date</label>
                                    <input class="form-control" type="date" name="due_date" value="${task.due_date || ''}">
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label for="team_id" class="form-label">Team</label>
                                    <!-- Team is LOCKED for editing -->
                                    <select class="form-select" name="team_id" id="team-select" disabled>
                                        <option value="">Loading...</option>
                                    </select>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="assigned_to" class="form-label">Assign To</label>
                                    <select class="form-select" name="assigned_to" id="assignee-select">
                                        <option value="">-- Unassigned --</option>
                                    </select>
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary"><i class="fas fa-save me-2"></i> Save Changes</button>
                        </form>
                    </div>
                </div>
            `;
        } else if (isAssignee) {
            // STATUS ONLY FORM (Assignee)
            editFormHtml = `
                <div class="card mt-4 shadow-sm border-info">
                    <div class="card-header bg-info text-white">
                        <h5 class="mb-0"><i class="fas fa-user-edit me-2"></i> Update Status</h5>
                    </div>
                    <div class="card-body">
                        <form id="edit-task-form">
                            <!-- Hidden fields to preserve other values or handled by backend partial update -->
                            <div class="mb-3">
                                <label for="status" class="form-label">Status</label>
                                <div class="input-group">
                                    <select class="form-select" name="status">
                                        <option value="TODO" ${task.status === 'TODO' ? 'selected' : ''}>To Do</option>
                                        <option value="IN_PROGRESS" ${task.status === 'IN_PROGRESS' ? 'selected' : ''}>In Progress</option>
                                        <option value="DONE" ${task.status === 'DONE' ? 'selected' : ''}>Done</option>
                                    </select>
                                    <button type="submit" class="btn btn-info text-white">Update Status</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            `;
        }

        // Fetch TEAM MEMBERS to populate assignee dropdown ONLY if Leader
        if (isLeader) {
            populateTeamMembersSelect(task.team_id, task.assigned_to);
        }

        taskContentDiv.innerHTML = `
            <div class="card shadow-sm">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h1 class="h3 mb-0">${escapeHtml(task.title || 'Untitled Task')}</h1>
                    ${(isLeader || isCreator || isAdmin) ? `<button id="delete-task-btn" class="btn btn-outline-danger btn-sm"><i class="fas fa-trash me-1"></i> Delete</button>` : ''}
                </div>
                <div class="card-body">
                    <p class="card-text lead">${escapeHtml(task.description || 'No description provided.')}</p>
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <p><strong>Status:</strong> ${statusBadge}</p>
                            <p><strong>Priority:</strong> ${priorityBadge}</p>
                            <p><strong>Due Date:</strong> ${formatDate(task.due_date)}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Team:</strong> ${task.team_details ? escapeHtml(task.team_details.name) : '-'}</p>
                            <p><strong>Assignee:</strong> ${task.assigned_to_details ? escapeHtml(task.assigned_to_details.username) : '-'}</p>
                            <p><strong>Creator:</strong> ${task.created_by_details ? escapeHtml(task.created_by_details.username) : '-'}</p>
                        </div>
                    </div>
                    <p class="text-muted small"><i class="far fa-clock me-1"></i> Created: ${formatDateTime(task.created_at)}</p>
                </div>
            </div>
            ${editFormHtml}
        `;

        // Add event listeners
        if (isLeader) {
            document.getElementById('edit-task-form').addEventListener('submit', handleUpdateTask);
            populateTeamSelect(task.team_id);
        } else if (isAssignee) {
            document.getElementById('edit-task-form').addEventListener('submit', handleUpdateStatusOnly);
        }

        if (isLeader || isCreator || isAdmin) {
            document.getElementById('delete-task-btn')?.addEventListener('click', handleDeleteTask);
        }
    }

    // Fetch only members of the specific team
    async function populateTeamMembersSelect(teamId, currentAssigneeId) {
        if (!teamId) return;
        
        try {
            // 1. Fetch Team Details to get member IDs
            const team = await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`);
            if (!team || !team.members) return;

            // Parse members (handle string/list variations)
            let memberIds = [];
            if (typeof team.members === 'string') memberIds = team.members.split(',').map(Number).filter(Boolean);
            else if (Array.isArray(team.members)) memberIds = team.members.map(Number).filter(Boolean);
            else if (typeof team.members === 'number') memberIds = [team.members];

            // 2. Fetch User Details for these members
            if (memberIds.length === 0) return;
            const users = await apiRequest(USER_SERVICE_URL, '/users?ids=' + memberIds.join(','));

            // 3. Populate Dropdown
            const assigneeSelect = document.getElementById('assignee-select');
            if (assigneeSelect && users) {
                assigneeSelect.innerHTML = '<option value="">-- Unassigned --</option>';
                users.forEach(u => {
                    const option = document.createElement('option');
                    option.value = u.id;
                    option.textContent = escapeHtml(u.username);
                    if (u.id === currentAssigneeId) option.selected = true;
                    assigneeSelect.appendChild(option);
                });
            }
        } catch (err) {
            console.error("Failed to populate team members:", err);
        }
    }

    // Fetch all teams to populate the team dropdown for task creation/editing
    async function populateTeamSelect(currentTeamId) {
        const teamSelect = document.getElementById('team-select');
        if (!teamSelect) return;

        try {
            const teams = await apiRequest(TEAM_SERVICE_URL, '/teams', 'GET');
            if (teams) {
                teams.forEach(team => {
                    const option = document.createElement('option');
                    option.value = team.id;
                    option.textContent = escapeHtml(team.name);
                    if (team.id === currentTeamId) { // Pre-select current team if editing
                        option.selected = true;
                    }
                    teamSelect.appendChild(option);
                });
            }
        } catch (err) {
            console.error("Failed to fetch teams:", err);
            showToast(`Failed to fetch teams: ${err.error || 'Unknown error'}`, true);
        }
    }


    async function handleUpdateTask(e) {
        e.preventDefault();
        const form = e.target;
        const taskIdToUpdate = taskId; // Use the taskId from URL

        const payload = {
            title: form.querySelector('[name="title"]').value.trim(),
            description: form.querySelector('[name="description"]').value.trim(),
            priority: form.querySelector('[name="priority"]').value,
            status: form.querySelector('[name="status"]').value,
            due_date: form.querySelector('[name="due_date"]').value || null,
            team_id: parseInt(form.querySelector('[name="team_id"]').value) || null,
            assigned_to: form.querySelector('[name="assigned_to"]').value ? parseInt(form.querySelector('[name="assigned_to"]').value) : null
        };

        if (!payload.title) {
            showToast('Task title is required.', true);
            return;
        }
        if (!payload.team_id) {
            showToast('Team is required.', true);
            return;
        }

        try {
            await apiRequest(TASK_SERVICE_URL, `/tasks/${taskIdToUpdate}`, 'PUT', payload);
            showToast('Task updated successfully!');
            loadTask(); // Reload task to show updated info
        } catch (err) {
            console.error("Failed to update task:", err);
            showToast(`Failed to update task: ${err.error || 'Unknown error'}`, true);
        }
    }
    
    async function handleUpdateStatusOnly(e) {
        e.preventDefault();
        const form = e.target;
        const newStatus = form.querySelector('[name="status"]').value;
        
        try {
            await apiRequest(TASK_SERVICE_URL, `/tasks/${taskId}`, 'PUT', { status: newStatus });
            showToast('Status updated successfully!');
            loadTask();
        } catch (err) {
            console.error("Failed to update status:", err);
            showToast(`Failed to update status: ${err.error || 'Unknown error'}`, true);
        }
    }
    
    async function handleDeleteTask() {
        if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
            return;
        }
        try {
            await apiRequest(TASK_SERVICE_URL, `/tasks/${taskId}`, 'DELETE');
            showToast('Task deleted successfully!');
            setTimeout(() => { window.location.href = 'my-tasks.html'; }, 1500); // Redirect after deletion
        } catch (err) {
            console.error("Failed to delete task:", err);
            showToast(`Failed to delete task: ${err.error || 'Unknown error'}`, true);
        }
    }

    function renderComments(comments) {
        let commentsHtml = '';
        if (comments.length === 0) {
            commentsHtml = '<div class="list-group-item">No comments yet.</div>';
        } else {
            comments.forEach(c => {
                commentsHtml += `
                    <div class="list-group-item">
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="mb-1">${escapeHtml(c.author_username || 'Unknown')}</h6>
                            <small>${formatDateTime(c.created_at)}</small>
                        </div>
                        <p class="mb-1">${escapeHtml(c.content || '')}</p>
                    </div>
                `;
            });
        }

        commentsDiv.innerHTML = `
            <div class="list-group mb-3">${commentsHtml}</div>
            <div class="mb-2">
                <textarea id="comment-input" class="form-control" placeholder="Add a comment..." rows="3"></textarea>
            </div>
            <button id="post-comment-btn" class="btn btn-primary btn-sm">Post Comment</button>
        `;
        document.getElementById('post-comment-btn').addEventListener('click', handlePostComment);
    }

    async function handlePostComment() {
        const contentInput = document.getElementById('comment-input');
        const content = contentInput.value.trim();
        if (!content) {
            showToast('Comment cannot be empty.', true);
            return;
        }
        
        const postBtn = document.getElementById('post-comment-btn');
        postBtn.disabled = true;
        postBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Posting...';

        try {
            await apiRequest(TASK_SERVICE_URL, `/tasks/${taskId}/comments`, 'POST', { content });
            showToast('Comment posted successfully!');
            contentInput.value = ''; // Clear input
            loadTask(); // Reload task to show new comment
        } catch (err) {
            console.error("Failed to post comment:", err);
            showToast(`Failed to post comment: ${err.error || 'Unknown error'}`, true);
        } finally {
            postBtn.disabled = false;
            postBtn.textContent = 'Post Comment';
        }
    }
    
    function renderAttachments(attachments) {
        let attachmentsHtml = '';
        if (attachments.length === 0) {
            attachmentsHtml = '<div class="list-group-item">No attachments yet.</div>';
        } else {
            attachments.forEach(a => {
                // Construct URL carefully, assuming backend serves files from /files/
                const fileUrl = a.url.startsWith('/') ? `${TASK_SERVICE_URL}${a.url}` : a.url;
                attachmentsHtml += `
                    <a href="${fileUrl}" target="_blank" class="list-group-item list-group-item-action">
                        <i class="fas fa-paperclip me-2"></i> ${escapeHtml(a.original_name || 'Unnamed Attachment')}
                    </a>
                `;
            });
        }

        attachmentsDiv.innerHTML = `
            <div class="list-group mb-3">${attachmentsHtml}</div>
            <div id="drop-zone" class="text-center p-3 border rounded mb-3" style="cursor: pointer;">
                <i class="fas fa-upload me-2"></i> Drag & drop files here or click to upload
            </div>
            <input type="file" id="file-upload-input" class="d-none">
        `;

        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-upload-input');

        // Click to upload
        dropZone.addEventListener('click', () => fileInput.click());

        // Drag and drop handlers
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                handleAttachmentUpload(e.dataTransfer.files[0]);
            }
        });

        // File input change handler
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                handleAttachmentUpload(e.target.files[0]);
            }
        });
    }

    async function handleAttachmentUpload(file) {
        const dropZone = document.getElementById('drop-zone');
        const originalDropZoneContent = dropZone.innerHTML;
        dropZone.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Uploading ${escapeHtml(file.name)}...`;
        dropZone.style.pointerEvents = 'none'; // Prevent interaction during upload

        const formData = new FormData();
        formData.append('file', file); // 'file' must match the field name expected by the backend
        formData.append('original_name', file.name); // Pass original name if backend expects it

        try {
            // Use apiRequest or fetch directly if apiRequest doesn't support FormData well
            // Assuming apiRequest can handle FormData with correct headers
            await apiRequest(TASK_SERVICE_URL, `/tasks/${taskId}/attachments`, 'POST', formData);
            showToast('Attachment uploaded successfully!');
            loadTask(); // Reload task to show new attachment
        } catch (err) {
            console.error("Failed to upload attachment:", err);
            showToast(`Attachment upload failed: ${err.error || 'Unknown error'}`, true);
        } finally {
            dropZone.innerHTML = originalDropZoneContent; // Restore content
            dropZone.style.pointerEvents = 'auto'; // Re-enable interaction
        }
    }

    // Initial load
    loadTask();
});