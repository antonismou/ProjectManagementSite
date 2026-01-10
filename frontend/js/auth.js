// Toggle login <-> signup
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const goSignupLink = document.getElementById("go-signup");
const goLoginLink = document.getElementById("go-login");

if (goSignupLink && signupForm && loginForm) {
  goSignupLink.addEventListener("click", (e) => {
    e.preventDefault();
    loginForm.classList.add("hidden");
    signupForm.classList.remove("hidden");
  });
}

if (goLoginLink && signupForm && loginForm) {
  goLoginLink.addEventListener("click", (e) => {
    e.preventDefault();
    signupForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
  });
}

// Login submit
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(loginForm);
    const username = formData.get("username");
    const password = formData.get("password");

    try {
      const result = await apiRequest(USER_SERVICE_URL, "/login", "POST", {
        username,
        password
      });
      localStorage.setItem("user", JSON.stringify(result.user));
      localStorage.setItem("token", result.token);
      // After login always go to dashboard
      window.location.href = "dashboard.html";
    } catch (err) {
      alert(err.error || "Login failed");
    }
  });
}

// Signup submit
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(signupForm);
    const data = {
      username: formData.get("username"),
      email: formData.get("email"),
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      password: formData.get("password")
    };

    try {
      await apiRequest(USER_SERVICE_URL, "/signup", "POST", data);
      alert("Εγγραφή επιτυχής. Ο λογαριασμός σου θα ενεργοποιηθεί από τον διαχειριστή. Παρακαλώ περίμενε.");
      signupForm.reset();
      signupForm.classList.add("hidden");
      loginForm.classList.remove("hidden");
    } catch (err) {
      alert(err.error || "Signup failed");
    }
  });
}

// LOGOUT - δουλεύει σε ΟΛΕΣ τις σελίδες
document.addEventListener("click", (e) => {
  if (e.target.matches("#logout-link") || e.target.closest("#logout-link")) {
    e.preventDefault();
    console.log("Logout clicked - clearing localStorage");
    localStorage.clear();
    window.location.href = "index.html";
  }
});
