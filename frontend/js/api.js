// Ρύθμιση URLs των microservices (προς το παρόν placeholders)
const USER_SERVICE_URL = "http://34.7.86.218:8080";
const TEAM_SERVICE_URL = "http://34.7.86.218:8081";
const TASK_SERVICE_URL = "http://34.7.86.218:8082";

async function apiRequest(baseUrl, path, method = "GET", body = null, token = null) {
  console.log("apiRequest:", baseUrl + path, method, {token: !!token});  // DEBUG
  
  const headers = {};
  
  // Only set JSON content type if body is not FormData
  if (body && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
  }

  // Authorization token: prefer explicit param, otherwise read from localStorage
  let authToken = token;
  if (!authToken) {
    try {
      authToken = localStorage.getItem("token");
    } catch (e) {
      authToken = null;
    }
  }
  if (authToken) {
    headers["Authorization"] = "Bearer " + authToken;
  }

  // propagate user role and id to backend services so they can enforce permissions
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const user = JSON.parse(raw);
      if (user && user.role) {
        headers["X-User-Role"] = user.role;
      }
      if (user && user.id) {
        headers["X-User-Id"] = String(user.id);
      }
    }
  } catch (e) {
    // ignore parsing errors
  }

  try {
    const fetchOptions = {
      method,
      headers
    };

    if (body instanceof FormData) {
        fetchOptions.body = body;
    } else if (body) {
        fetchOptions.body = JSON.stringify(body);
    }

    const res = await fetch(baseUrl + path, fetchOptions);
    
    console.log("Response status:", res.status);  // DEBUG
    
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }

    if (!res.ok) {
      throw data;
    }
    console.log("apiRequest success:", data);  // DEBUG
    return data;
  } catch (error) {
    console.error("apiRequest error:", error);  // DEBUG
    throw error;
  }
}

function showToast(message, isError = false) {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        console.error('No toast container found on the page.');
        return;
    }

    const toastId = 'toast-' + Math.random().toString(36).substr(2, 9);
    const toastHeaderClass = isError ? 'bg-danger text-white' : 'bg-success text-white';
    const toastTitle = isError ? 'Error' : 'Success';

    const toastHtml = `
        <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header ${toastHeaderClass}">
                <strong class="me-auto">${toastTitle}</strong>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `;
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { delay: 5000 });
    toast.show();

    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

