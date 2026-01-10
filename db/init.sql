-- Init DB schema for PLH513 project
CREATE DATABASE IF NOT EXISTS pms;
USE pms;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  password VARCHAR(255) NOT NULL,
  role ENUM('ADMIN','TEAM_LEADER','MEMBER') NOT NULL DEFAULT 'MEMBER',
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  leader_id INT,
  members TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'TODO',
  priority VARCHAR(50) DEFAULT 'MEDIUM',
  due_date DATE,
  team_id INT,
  created_by INT,
  assigned_to INT
);

CREATE TABLE IF NOT EXISTS comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  author_id INT,
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  author_id INT,
  url VARCHAR(1024),
  original_name VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- create a default admin user so roles can be managed immediately
INSERT INTO users (username, email, first_name, last_name, password, role, active)
SELECT 'admin', 'admin@example.com', 'Admin', 'User', 'admin', 'ADMIN', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='admin');
