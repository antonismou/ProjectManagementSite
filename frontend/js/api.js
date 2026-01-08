// Ρύθμιση URLs των microservices (προς το παρόν placeholders)
const USER_SERVICE_URL = "http://localhost:8080";
const TEAM_SERVICE_URL = "http://localhost:8081";
const TASK_SERVICE_URL = "http://localhost:8082";

async function apiRequest(baseUrl, path, method = "GET", body = null, token = null) {
  console.log("apiRequest:", baseUrl + path, method, {token: !!token});  // DEBUG
  
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  try {
    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });
    
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

