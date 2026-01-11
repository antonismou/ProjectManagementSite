# Project Management System (PMS)

🌐 **Live Demo:** [http://34.7.86.218:8000/](http://34.7.86.218:8000/)

A comprehensive, microservices-based application for managing teams, users, and tasks. This project demonstrates a distributed architecture using Python-based microservices, a MySQL database, and a responsive frontend interface.

## 🚀 Project Overview

**Goal:** To provide a streamlined environment for collaboration where Administrators can manage users, Team Leaders can organize groups, and Members can track and complete tasks.

**Key Technologies:**
*   **Frontend:** Vanilla JavaScript, HTML5, CSS3 (Served via Nginx).
*   **Backend:** Python 3.13 (Custom `http.server` microservices).
*   **Database:** MySQL 8.0.
*   **Infrastructure:** Docker & Docker Compose.
*   **Tools:** phpMyAdmin for database management.

---

## 🛠️ Installation & Setup

### Prerequisites
*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
*   Git (to clone the repository).

### Quick Start
The entire stack is containerized. You can spin up the environment with a single command.

1.  **Clone the repository** (if not already done):
    ```bash
    git clone https://github.com/antonismou/PLH513
    cd PLH513
    ```

2.  **Build and Run** using Docker Compose:
    ```bash
    docker compose up -d --build
    ```
    *This command builds the Python images, pulls MySQL/Nginx/phpMyAdmin images, and starts the containers.*

3.  **Verify Status:**
    Ensure all containers (`frontend`, `user-service`, `team-service`, `task-service`, `mysql`, `phpmyadmin`) are in the `Up` state.

### ⚠️ Important Configuration Note
The frontend application (`frontend/js/api.js`) currently has **hardcoded IP addresses** pointing to a cloud environment (`34.7.86.218`).

**For local development, you MUST update this file:**

1.  Open `frontend/js/api.js`.
2.  Locate the service URL constants at the top of the file.
3.  Change them to `localhost`:

    ```javascript
    // Change these lines:
    const USER_SERVICE_URL = "http://localhost:8080";
    const TEAM_SERVICE_URL = "http://localhost:8081";
    const TASK_SERVICE_URL = "http://localhost:8082";
    ```
    *If you do not do this, the frontend will fail to connect to your local backend services.*

---

## 🗄️ Database Setup

The database infrastructure is fully automated.

*   **Initialization:** On the first run, the `db/init.sql` script is automatically executed by the MySQL container. This creates the `pms` database, tables (`users`, `teams`, `tasks`, etc.), and populates seed data.
*   **Persistence:** Data is persisted in a Docker volume named `mysql_data`.
*   **Connection Details:**
    *   **Host:** `mysql` (internal docker network) / `localhost` (external).
    *   **Port:** `3306`
    *   **Database:** `pms`
    *   **User:** `pms` / **Password:** `pms`

### Management Interface
You can access **phpMyAdmin** to inspect the database directly:
*   **URL:** [http://localhost:8083](http://localhost:8083)
*   **Server:** `mysql`
*   **Username:** `pms`
*   **Password:** `pms`

---

## 🖥️ UI Usage & Features

### Accessing the Application
Open your browser and navigate to the Frontend URL:
👉 **[http://localhost:8000](http://localhost:8000)**

### Login Credentials (Demo Data)
The system comes pre-loaded with users for testing different roles:

| Role | Username | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin` | Manage users, view all data. |
| **Team Leader** | `leader1` | `leader` | Create teams, assign tasks. |
| **Member** | `member1` | `member` | View and complete assigned tasks. |

### Navigation Guide
1.  **Login:** Enter valid credentials on the landing page.
2.  **Dashboard:** View a summary of your active tasks and team status.
3.  **Profile:** Update your personal information (availability status, details).
4.  **Admin Panel (Admin only):** Create or delete users and manage system roles.
5.  **Teams (Leader/Admin):** Create new project teams and assign members.
6.  **My Tasks:** Filter tasks by status (Todo, In Progress, Done) and update progress.

---

## 🔌 API Endpoints (For Developers)

The backend is split into three distinct microservices accessible locally:

*   **User Service:** `http://localhost:8080` (Auth, User CRUD)
*   **Team Service:** `http://localhost:8081` (Team logic)
*   **Task Service:** `http://localhost:8082` (Task CRUD, Attachments)

---

## ⚠️ Troubleshooting

*   **Database Connection Errors:** The services include a retry mechanism (30s) on startup to wait for MySQL. If errors persist, restart the stack: `docker compose restart`.
*   **Port Conflicts:** Ensure ports `8000`, `8080-8083`, and `3306` are free on your host machine.