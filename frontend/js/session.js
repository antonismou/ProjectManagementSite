function requireAuth() {
  const userJson = localStorage.getItem("user");

  if (!userJson) {
    // ❌ δεν είναι συνδεδεμένος
    window.location.href = "index.html";
    return null;
  }

  try {
    return JSON.parse(userJson);
  } catch {
    localStorage.clear();
    window.location.href = "index.html";
    return null;
  }
}

function logout() {
  localStorage.clear();
  window.location.href = "index.html";
}
