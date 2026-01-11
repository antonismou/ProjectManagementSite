document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAuth();
    if (!user) return;

    // Navbar setup
    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay) usernameDisplay.textContent = user.username;
    if (user.role === 'ADMIN') {
        const container = document.getElementById('admin-link-container');
        if (container) {
            const a = document.createElement('a');
            a.href = 'admin.html';
            a.textContent = 'Admin';
            a.className = 'nav-link';
            container.appendChild(a);
        }
    }

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
        document.getElementById('task-content').innerHTML = '<div class="alert alert-danger">Task ID is missing.</div>';
        return;
    }

    async function loadTask() {
        try {
            const token = localStorage.getItem('token');
            const task = await apiRequest(TASK_SERVICE_URL, `/tasks/${id}`, 'GET', null, token);
            renderTask(task);
            renderComments(task.comments || []);
            renderAttachments(task.attachments || []);
        } catch (err) {
            console.error(err);
            document.getElementById('task-content').innerHTML = '<div class="alert alert-danger">Failed to load task details.</div>';
        }
    }

    function renderTask(task) {
        const container = document.getElementById('task-content');
        const isAdmin = user.role === 'ADMIN';
        const isLeader = user.role === 'TEAM_LEADER' && Number(user.id) === Number(task.team_leader_id);
        const isAssigned = Number(user.id) === Number(task.assigned_to);

        let statusBadge = `<span class="badge bg-secondary">${task.status}</span>`;
        if (task.status === 'IN_PROGRESS') statusBadge = `<span class="badge bg-warning text-dark">${task.status}</span>`;
        if (task.status === 'DONE') statusBadge = `<span class="badge bg-success">${task.status}</span>`;

        let priorityBadge = `<span class="badge bg-secondary">${task.priority}</span>`;
        if (task.priority === 'HIGH') priorityBadge = `<span class="badge bg-danger">${task.priority}</span>`;
        if (task.priority === 'MEDIUM') priorityBadge = `<span class="badge bg-warning text-dark">${task.priority}</span>`;
        if (task.priority === 'LOW') priorityBadge = `<span class="badge bg-success">${task.priority}</span>`;
        
        let editFormHtml = '';
        if (isAdmin || isLeader) {
            editFormHtml = `
                <div class="card mt-4">
                    <div class="card-header">
                        <h5>Edit Task</h5>
                    </div>
                    <div class="card-body">
                        <form id="edit-task-form">
                            <div class="mb-3"><label for="title" class="form-label">Title</label><input class="form-control" name="title" value="${escapeHtml(task.title || '')}" required></div>
                            <div class="mb-3"><label for="description" class="form-label">Description</label><textarea class="form-control" name="description">${escapeHtml(task.description || '')}</textarea></div>
                            <div class="row">
                                <div class="col-md-6 mb-3"><label for="priority" class="form-label">Priority</label><select class="form-select" name="priority"><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></div>
                                <div class="col-md-6 mb-3"><label for="due_date" class="form-label">Due Date</label><input class="form-control" type="date" name="due_date" value="${task.due_date || ''}"></div>
                            </div>
                            <div class="mb-3"><label for="edit-assigned-select" class="form-label">Assign To</label><select class="form-select" name="assigned_to" id="edit-assigned-select"><option value="">-</option></select></div>
                            <button type="submit" class="btn btn-primary">Save Changes</button>
                        </form>
                    </div>
                </div>
            `;
        }

        let statusChangeHtml = '';
        if (isAssigned) {
            statusChangeHtml = `
                <div class="mt-3">
                    <h5>Change Status</h5>
                    <div class="input-group">
                        <select id="status-select" class="form-select">
                            <option>TODO</option>
                            <option>IN_PROGRESS</option>
                            <option>DONE</option>
                        </select>
                        <button id="status-change" class="btn btn-outline-secondary">Update</button>
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="card">
                <div class="card-header"><h1>${task.title}</h1></div>
                <div class="card-body">
                    <div class="d-flex justify-content-between mb-3">
                        <span><strong>Status:</strong> ${statusBadge}</span>
                        <span><strong>Priority:</strong> ${priorityBadge}</span>
                        <span><strong>Due:</strong> ${task.due_date || '-'}</span>
                    </div>
                    <p class="card-text">${task.description || 'No description provided.'}</p>
                    ${statusChangeHtml}
                </div>
            </div>
            ${editFormHtml}
        `;

        if (isAdmin || isLeader) {
            document.querySelector('#edit-task-form [name="priority"]').value = task.priority;
            document.getElementById('edit-task-form').addEventListener('submit', handleUpdateTask);
            populateAssignToSelect(task.team_id, task.assigned_to);
        }
        if (isAssigned) {
            document.getElementById('status-select').value = task.status;
            document.getElementById('status-change').addEventListener('click', handleChangeStatus);
        }
    }

    async function populateAssignToSelect(teamId, selectedUserId) {
        try {
            const token = localStorage.getItem('token');
            const team = await apiRequest(TEAM_SERVICE_URL, `/teams/${teamId}`, 'GET', null, token);
            const select = document.getElementById('edit-assigned-select');
            if (select && team && team.members) {
                select.innerHTML = '<option value="">- Unassign -</option>' + team.members.map(m => `<option value="${m.id}">${m.username}</option>`).join('');
                if (selectedUserId) select.value = String(selectedUserId);
            }
        } catch (e) {
            console.error('Failed to populate assign-to select', e);
        }
    }

    async function handleUpdateTask(e) {
        e.preventDefault();
        const form = e.target;
        const payload = {
            title: form.querySelector('[name="title"]').value,
            description: form.querySelector('[name="description"]').value,
            priority: form.querySelector('[name="priority"]').value,
            due_date: form.querySelector('[name="due_date"]').value || null,
            assigned_to: form.querySelector('[name="assigned_to"]').value ? Number(form.querySelector('[name="assigned_to"]').value) : null
        };
        try {
            await apiRequest(TASK_SERVICE_URL, `/tasks/${id}`, 'PUT', payload, localStorage.getItem('token'));
            showToast('Task updated successfully!');
            loadTask();
        } catch (err) {
            showToast(err.error || 'Failed to update task', true);
        }
    }
    
    async function handleChangeStatus() {
        const newStatus = document.getElementById('status-select').value;
        try {
            await apiRequest(TASK_SERVICE_URL, `/tasks/${id}`, 'PUT', { status: newStatus }, localStorage.getItem('token'));
            showToast('Status updated successfully!');
            loadTask();
        } catch (err) {
            showToast(err.error || 'Failed to change status', true);
        }
    }

    function renderComments(comments) {
        const container = document.getElementById('comments');
        let commentsHtml = comments.map(c => {
            const authorName = c.author ? c.author.username : 'Unknown';
            return `<div class="list-group-item">
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="mb-1">${escapeHtml(authorName)}</h6>
                            <small>${new Date(c.created_at).toLocaleString()}</small>
                        </div>
                        <p class="mb-1">${escapeHtml(c.content || '')}</p>
                    </div>`;
        }).join('');
        
        container.innerHTML = `
            <div class="list-group mb-3">${commentsHtml || '<div class="list-group-item">No comments yet.</div>'}</div>
            <div>
                <div class="mb-2"><textarea id="comment-input" class="form-control" placeholder="Add a comment..."></textarea></div>
                <button id="comment-send" class="btn btn-sm btn-primary">Post Comment</button>
            </div>
        `;
        document.getElementById('comment-send').addEventListener('click', handlePostComment);
    }

    async function handlePostComment() {
        const content = document.getElementById('comment-input').value.trim();
        if (!content) {
            showToast('Comment cannot be empty.', true);
            return;
        }
        this.disabled = true;
        try {
            await apiRequest(TASK_SERVICE_URL, `/tasks/${id}/comments`, 'POST', { content }, localStorage.getItem('token'));
            loadTask();
        } catch (err) {
            showToast(err.error || 'Failed to post comment', true);
        } finally {
            this.disabled = false;
        }
    }
    
    function renderAttachments(attachments) {
        const container = document.getElementById('attachments');
        let attachmentsHtml = attachments.map(a => {
            const href = a.url.startsWith('http') ? a.url : `${TASK_SERVICE_URL}${a.url}`;
            return `<a href="${href}" target="_blank" class="list-group-item list-group-item-action">${escapeHtml(a.original_name || a.url)}</a>`;
        }).join('');

        container.innerHTML = `
            <div class="list-group mb-3">${attachmentsHtml || '<div class="list-group-item">No attachments.</div>'}</div>
            <div id="drop-zone"><i class="fas fa-upload me-2"></i> Drop file or click to upload</div>
            <input type="file" id="attach-file-input" class="d-none">
        `;

        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('attach-file-input');
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                handleUpload(e.dataTransfer.files[0]);
            }
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                handleUpload(e.target.files[0]);
            }
        });
    }

    async function handleUpload(file) {
        const dropZone = document.getElementById('drop-zone');
        const originalText = dropZone.innerHTML;
        dropZone.innerHTML = `<div class="spinner-border spinner-border-sm" role="status"></div> Uploading...`;
        
        const formData = new FormData();
        formData.append('file', file, file.name);
        formData.append('original_name', file.name);

        const token = localStorage.getItem('token');
        const headers = {};
        if (token) headers['Authorization'] = 'Bearer ' + token;
        if (user && user.role) headers['X-User-Role'] = user.role;
        if (user && user.id) headers['X-User-Id'] = String(user.id);

        try {
            const res = await fetch(`${TASK_SERVICE_URL}/tasks/${id}/attachments`, {
                method: 'POST',
                headers: headers,
                body: formData
            });
            if (!res.ok) throw await res.json();
            loadTask();
        } catch (err) {
            showToast(err.error || 'File upload failed.', true);
        } finally {
            dropZone.innerHTML = originalText;
        }
    }

    function escapeHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    loadTask();
});
