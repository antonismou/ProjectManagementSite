// task.js - shows task details, comments, attachments and edit/status controls
document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth();
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    document.getElementById('task-content').innerText = 'Missing task id';
    return;
  }

  async function load() {
    try {
      const token = localStorage.getItem('token');
      const task = await apiRequest(TASK_SERVICE_URL, `/tasks/${id}`, 'GET', null, token);
      renderTask(task);
      renderComments(task.comments || []);
      renderAttachments(task.attachments || []);
    } catch (err) {
      console.error(err);
      document.getElementById('task-content').innerText = 'Failed to load task';
    }
  }

  function renderTask(task) {
    const container = document.getElementById('task-content');
    const isAdmin = user.role === 'ADMIN';
    const isLeader = user.role === 'TEAM_LEADER' && Number(user.id) === Number((task.team_leader_id || task.team_leader || {}).id || task.team_leader_id);
    const isAssigned = Number(user.id) === Number(task.assigned_to);

    let html = `<h2>${task.title}</h2>`;
    html += `<div class="task-meta">Status: ${task.status} | Priority: ${task.priority} | Due: ${task.due_date || '-'} | Team: ${task.team_id} | Created: ${task.created_at || ''}</div>`;
    html += `<div style="margin-top:0.8rem">${task.description || ''}</div>`;

    // edit form for admin or team leader
    if (isAdmin || isLeader) {
      html += `<hr><h3>Edit Task</h3>`;
      html += `<form id="edit-task-form">
        <input name="title" value="${escapeHtml(task.title || '')}" required>
        <textarea name="description">${escapeHtml(task.description || '')}</textarea>
        <label>Priority: <select name="priority"><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label>
        <label>Due date: <input type="date" name="due_date" value="${task.due_date || ''}"></label>
  <label>Assign to: <select name="assigned_to" id="edit-assigned-select"><option value="">-</option></select></label>
        <div style="margin-top:0.5rem"><button type="submit">Save</button></div>
      </form>`;
    }

    // status change for assignee
    if (isAssigned) {
      html += `<hr><div><strong>Change Status</strong></div>`;
      html += `<select id="status-select"><option>TODO</option><option>IN_PROGRESS</option><option>DONE</option></select> <button id="status-change">Change</button>`;
    }

    container.innerHTML = html;

    if (isAdmin || isLeader) {
      const form = document.getElementById('edit-task-form');
      // populate assigned_to select with team members
      (async () => {
        try {
          const token = localStorage.getItem('token');
          const teamResp = await apiRequest(TEAM_SERVICE_URL, `/teams/${task.team_id}`, 'GET', null, token);
          const select = document.getElementById('edit-assigned-select');
          if (select && teamResp && teamResp.members) {
            // clear existing options except the default
            select.innerHTML = '<option value="">-</option>' + teamResp.members.map(m => `<option value="${m.id}">${m.username} ${(m.first_name||'') + ' ' + (m.last_name||'')}</option>`).join('');
            if (task.assigned_to) select.value = String(task.assigned_to);
          }
        } catch (e) {
          // ignore populate errors
          console.error('Failed to populate assigned-to select', e);
        }
      })();
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const payload = {
            title: fd.get('title'),
            description: fd.get('description'),
            priority: fd.get('priority'),
            due_date: fd.get('due_date') || null,
            assigned_to: fd.get('assigned_to') ? Number(fd.get('assigned_to')) : null
          };
          try {
            const token = localStorage.getItem('token');
            await apiRequest(TASK_SERVICE_URL, `/tasks/${id}`, 'PUT', payload, token);
            alert('Task updated');
            load();
          } catch (err) {
            alert(err.error || 'Failed to update');
          }
        });
      }
    }

    if (isAssigned) {
      const sel = document.getElementById('status-select');
      if (sel) sel.value = task.status || 'TODO';
      const btn = document.getElementById('status-change');
      if (btn) btn.addEventListener('click', async () => {
        const newStatus = document.getElementById('status-select').value;
        try {
          const token = localStorage.getItem('token');
          await apiRequest(TASK_SERVICE_URL, `/tasks/${id}`, 'PUT', { status: newStatus }, token);
          alert('Status updated');
          load();
        } catch (err) {
          alert(err.error || 'Failed to change status');
        }
      });
    }
  }

  function renderComments(comments) {
    const container = document.getElementById('comments');
    let html = '<h3>Comments</h3>';
    html += `<div id="comment-list">`;
    comments.forEach(c => {
      const authorName = (c.author_username) ? c.author_username : (c.author && (c.author.username || (c.author.first_name + ' ' + c.author.last_name))) || c.author_id || 'Unknown';
      html += `<div class="comment"><div class="comment-meta">by ${escapeHtml(authorName)} at ${c.created_at}</div><div>${escapeHtml(c.content || '')}</div></div>`;
    });
    html += `</div>`;
    html += `<div style="margin-top:0.5rem"><textarea id="comment-input" placeholder="Add a comment"></textarea><br><button id="comment-send">Post</button></div>`;
    container.innerHTML = html;

    const sendBtn = document.getElementById('comment-send');
    sendBtn.addEventListener('click', async () => {
      const content = document.getElementById('comment-input').value.trim();
      if (!content) return alert('Empty comment');
      try {
        sendBtn.disabled = true;
        const token = localStorage.getItem('token');
        await apiRequest(TASK_SERVICE_URL, `/tasks/${id}/comments`, 'POST', { content }, token);
        document.getElementById('comment-input').value = '';
        await load();
      } catch (err) {
        alert(err.error || 'Failed to post comment');
      } finally {
        sendBtn.disabled = false;
      }
    });
  }

  function renderAttachments(atts) {
    const container = document.getElementById('attachments');
    let html = '<h3>Attachments</h3>';
    html += `<div id="attachment-list">`;
    atts.forEach(a => {
      const authorName = (a.author_username) ? a.author_username : (a.author && (a.author.username || (a.author.first_name + ' ' + a.author.last_name))) || a.author_id || 'Unknown';
      const href = (a.url && a.url.startsWith('http')) ? a.url : (TASK_SERVICE_URL + (a.url || ''));
      html += `<div class="attachment"><a href="${href}" target="_blank">${escapeHtml(a.original_name || a.url)}</a> <span class="meta">by ${escapeHtml(authorName)} at ${a.created_at}</span></div>`;
    });
    html += `</div>`;
    // drag & drop area + file input
    html += `<div style="margin-top:0.5rem">
      <div id="drop-zone" style="border:2px dashed #999;padding:1rem;text-align:center;">Drop file here or click to select</div>
      <input type="file" id="attach-file-input" style="display:none">
      <div style="margin-top:0.5rem"><button id="attach-send">Upload</button></div>
    </div>`;
    container.innerHTML = html;

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('attach-file-input');
    const uploadBtn = document.getElementById('attach-send');

    // click on drop zone opens file picker
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#666'; });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = '#999'; });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault(); dropZone.style.borderColor = '#999';
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) {
        fileInput.files = e.dataTransfer.files;
        dropZone.textContent = `Selected: ${f.name}`;
      }
    });

    uploadBtn.addEventListener('click', async () => {
      const files = fileInput.files;
      if (!files || files.length === 0) return alert('Select a file first (click the box or drop a file)');
      const file = files[0];
      try {
        uploadBtn.disabled = true;
        await uploadAttachment(file);
        fileInput.value = '';
        dropZone.textContent = 'Drop file here or click to select';
        await load();
      } catch (err) {
        alert(err.message || err.error || 'Failed to upload file');
      } finally {
        uploadBtn.disabled = false;
      }
    });
  }

  // upload file via multipart/form-data using fetch (apiRequest is JSON-only)
  async function uploadAttachment(file) {
    const token = localStorage.getItem('token');
    const raw = localStorage.getItem('user');
    let headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
      const user = raw ? JSON.parse(raw) : null;
      if (user && user.role) headers['X-User-Role'] = user.role;
      if (user && user.id) headers['X-User-Id'] = String(user.id);
    } catch (e) {}

    const form = new FormData();
    form.append('file', file, file.name);
    form.append('original_name', file.name);

    const res = await fetch(TASK_SERVICE_URL + `/tasks/${id}/attachments`, {
      method: 'POST',
      headers,
      body: form
    });
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw data;
    return data;
  }

  function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  await load();
});
