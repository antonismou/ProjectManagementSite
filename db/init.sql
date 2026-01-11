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
  status ENUM('TODO', 'IN_PROGRESS', 'DONE') DEFAULT 'TODO',
  priority ENUM('LOW', 'MEDIUM', 'HIGH') DEFAULT 'MEDIUM',
  due_date DATE,
  team_id INT,
  created_by INT,
  assigned_to INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  author_id INT,
  content TEXT NOT NULL,
  author_username VARCHAR(100) DEFAULT 'Unknown',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  author_id INT,
  url VARCHAR(1024),
  original_name VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

-- create a default admin user so roles can be managed immediately
INSERT INTO users (username, email, first_name, last_name, password, role, active)
SELECT 'admin', 'admin@example.com', 'Admin', 'User', 'admin', 'ADMIN', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='admin');

-- Create 2 Team Leaders
INSERT INTO users (username, email, first_name, last_name, password, role, active)
SELECT 'leader1', 'leader1@example.com', 'Leader', 'One', 'leader', 'TEAM_LEADER', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='leader1');

INSERT INTO users (username, email, first_name, last_name, password, role, active)
SELECT 'leader2', 'leader2@example.com', 'Leader', 'Two', 'leader', 'TEAM_LEADER', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='leader2');

-- Create 4 Members
INSERT INTO users (username, email, first_name, last_name, password, role, active)
SELECT 'member1', 'member1@example.com', 'Member', 'One', 'member', 'MEMBER', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='member1');

INSERT INTO users (username, email, first_name, last_name, password, role, active)
SELECT 'member2', 'member2@example.com', 'Member', 'Two', 'member', 'MEMBER', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='member2');

INSERT INTO users (username, email, first_name, last_name, password, role, active)
SELECT 'member3', 'member3@example.com', 'Member', 'Three', 'member', 'MEMBER', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='member3');

INSERT INTO users (username, email, first_name, last_name, password, role, active)
SELECT 'member4', 'member4@example.com', 'Member', 'Four', 'member', 'MEMBER', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='member4');