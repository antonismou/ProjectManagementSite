import json
import os
import cgi
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
import mysql.connector

def get_db_conn():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASS", ""),
        database=os.getenv("DB_NAME", "pms"),
        autocommit=True,
    )

TASKS = [
    # demo data για να δουλεύει το dashboard αμέσως
    {
        "id": 1,
        "title": "Στήσιμο User Service",
        "status": "TODO",
        "priority": "HIGH",
        "due_date": "2026-01-15",
        "team_id": 1
    },
    {
        "id": 2,
        "title": "Task Service API",
        "status": "IN_PROGRESS",
        "priority": "MEDIUM",
        "due_date": "2026-01-12",
        "team_id": 1
    },
    {
        "id": 3,
        "title": "Dashboard UI",
        "status": "DONE",
        "priority": "LOW",
        "due_date": "2026-01-10",
        "team_id": 1
    }
]


class TaskHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Role, X-User-Id")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        # serve uploaded files under /files/
        if self.path.startswith('/files/'):
            fname = self.path.split('/files/', 1)[1]
            uploads_dir = os.path.join(os.path.dirname(__file__), 'uploads')
            fpath = os.path.join(uploads_dir, fname)
            if os.path.exists(fpath) and os.path.isfile(fpath):
                try:
                    import mimetypes
                    ctype = mimetypes.guess_type(fpath)[0] or 'application/octet-stream'
                    self.send_response(200)
                    self.send_header('Content-Type', ctype)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    with open(fpath, 'rb') as fh:
                        # stream file
                        while True:
                            chunk = fh.read(8192)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                    return
                except Exception:
                    pass
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "File not found"}).encode('utf-8'))
            return

        # support list and single task GET
        if self.path == "/tasks" or self.path.startswith('/tasks/'):
            try:
                conn = get_db_conn()
                cur = conn.cursor(dictionary=True)
                if self.path == '/tasks':
                    cur.execute("SELECT id, title, description, status, priority, due_date, team_id, created_by, assigned_to, created_at FROM tasks")
                    rows = cur.fetchall()
                    self._set_headers(200)
                    self.wfile.write(json.dumps(rows, default=str).encode("utf-8"))
                else:
                    # GET /tasks/<id>
                    parts = self.path.split('/')
                    try:
                        task_id = int(parts[2])
                    except Exception:
                        self._set_headers(400)
                        self.wfile.write(json.dumps({"error": "Invalid task id"}).encode("utf-8"))
                        return
                    cur.execute("SELECT id, title, description, status, priority, due_date, team_id, created_by, assigned_to, created_at FROM tasks WHERE id=%s", (task_id,))
                    task = cur.fetchone()
                    if not task:
                        self._set_headers(404)
                        self.wfile.write(json.dumps({"error": "Task not found"}).encode("utf-8"))
                        return

                    # fetch comments and attachments
                    ccur = conn.cursor(dictionary=True)
                    ccur.execute("SELECT id, author_id, content, created_at FROM comments WHERE task_id=%s ORDER BY created_at ASC", (task_id,))
                    comments = ccur.fetchall()
                    ccur.execute("SELECT id, author_id, url, original_name, created_at FROM attachments WHERE task_id=%s ORDER BY created_at ASC", (task_id,))
                    attachments = ccur.fetchall()

                    # enrich comments and attachments with user info
                    author_ids = set()
                    for c in comments:
                        if c.get('author_id'):
                            author_ids.add(int(c.get('author_id')))
                    for a in attachments:
                        if a.get('author_id'):
                            author_ids.add(int(a.get('author_id')))
                    author_map = {}
                    if author_ids:
                        acur = conn.cursor(dictionary=True)
                        placeholders = ','.join(['%s'] * len(author_ids))
                        acur.execute(f"SELECT id, username, first_name, last_name FROM users WHERE id IN ({placeholders})", tuple(author_ids))
                        users = acur.fetchall()
                        for u in users:
                            author_map[int(u['id'])] = u
                        acur.close()

                    for c in comments:
                        aid = c.get('author_id')
                        if aid and int(aid) in author_map:
                            c['author'] = author_map[int(aid)]
                            c['author_username'] = author_map[int(aid)].get('username')
                        else:
                            c['author'] = None
                            c['author_username'] = None

                    for a in attachments:
                        aid = a.get('author_id')
                        if aid and int(aid) in author_map:
                            a['author'] = author_map[int(aid)]
                            a['author_username'] = author_map[int(aid)].get('username')
                        else:
                            a['author'] = None
                            a['author_username'] = None

                    ccur.close()

                    task['comments'] = comments
                    task['attachments'] = attachments
                    self._set_headers(200)
                    self.wfile.write(json.dumps(task, default=str).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    cur.close()
                    conn.close()
                except Exception:
                    pass
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def do_POST(self):
        # handle comments and attachments first to avoid sending a premature 404
        if self.path.startswith('/tasks/') and self.path.endswith('/comments'):
            try:
                parts = self.path.split('/')
                task_id = int(parts[2])
            except Exception:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid task id"}).encode("utf-8"))
                return
            length = int(self.headers.get('Content-Length', 0))
            ctype = self.headers.get('Content-Type', '')
            # support both application/json and multipart/form-data for comments
            if ctype.startswith('application/json'):
                body = self.rfile.read(length)
                try:
                    data = json.loads(body.decode('utf-8'))
                except Exception:
                    self._set_headers(400)
                    self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode('utf-8'))
                    return
                try:
                    author = int(self.headers.get('X-User-Id') or 0)
                except Exception:
                    author = 0
                try:
                    conn = get_db_conn()
                    cur = conn.cursor()
                    cur.execute("INSERT INTO comments (task_id, author_id, content) VALUES (%s,%s,%s)", (task_id, author, data.get('content')))
                    conn.commit()
                    cur.close()
                    self._set_headers(201)
                    self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
                except Exception as e:
                    self._set_headers(500)
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                finally:
                    try:
                        cur.close()
                        conn.close()
                    except Exception:
                        pass
                return
            else:
                # unsupported content-type for comments
                self._set_headers(415)
                self.wfile.write(json.dumps({"error": "Unsupported Media Type"}).encode('utf-8'))
                return

        if self.path.startswith('/tasks/') and self.path.endswith('/attachments'):
            try:
                parts = self.path.split('/')
                task_id = int(parts[2])
            except Exception:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid task id"}).encode("utf-8"))
                return
            ctype = self.headers.get('Content-Type', '')
            # handle multipart file upload
            if ctype.startswith('multipart/form-data'):
                try:
                    length = int(self.headers.get('Content-Length', 0))
                    fs = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={'REQUEST_METHOD':'POST', 'CONTENT_TYPE': ctype, 'CONTENT_LENGTH': str(length)})
                    # FieldStorage may raise or behave oddly on membership tests; access safely
                    try:
                        filefield = fs['file']
                    except Exception:
                        filefield = None
                    try:
                        original = fs.getvalue('original_name') if 'original_name' in fs else None
                    except Exception:
                        original = None
                    try:
                        author = int(self.headers.get('X-User-Id') or 0)
                    except Exception:
                        author = 0
                    # FieldStorage doesn't support truthiness checks
                    if filefield is None or not getattr(filefield, 'filename', None):
                        self._set_headers(400)
                        self.wfile.write(json.dumps({"error": "No file provided"}).encode('utf-8'))
                        return
                    filename = getattr(filefield, 'filename')
                    ext = os.path.splitext(filename)[1]
                    safe_name = f"{uuid.uuid4().hex}{ext}"
                    uploads_dir = os.path.join(os.path.dirname(__file__), 'uploads')
                    os.makedirs(uploads_dir, exist_ok=True)
                    filepath = os.path.join(uploads_dir, safe_name)
                    with open(filepath, 'wb') as out:
                        chunk = filefield.file.read(8192)
                        while chunk:
                            out.write(chunk)
                            chunk = filefield.file.read(8192)
                    # store attachment record pointing to a served file path
                    url = f"/files/{safe_name}"
                    conn = get_db_conn()
                    cur = conn.cursor()
                    cur.execute("INSERT INTO attachments (task_id, author_id, url, original_name) VALUES (%s,%s,%s,%s)", (task_id, author, url, original or filename))
                    conn.commit()
                    cur.close()
                    self._set_headers(201)
                    self.wfile.write(json.dumps({"status": "ok", "url": url}).encode('utf-8'))
                except Exception as e:
                    self._set_headers(500)
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                finally:
                    try:
                        if 'cur' in locals() and getattr(cur, 'close', None):
                            try:
                                cur.close()
                            except Exception:
                                pass
                        if 'conn' in locals() and getattr(conn, 'close', None):
                            try:
                                conn.close()
                            except Exception:
                                pass
                    except Exception:
                        pass
                return
            else:
                # support JSON fallback (url-only) for compatibility
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length)
                try:
                    data = json.loads(body.decode('utf-8'))
                except Exception:
                    self._set_headers(400)
                    self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode('utf-8'))
                    return
                try:
                    author = int(self.headers.get('X-User-Id') or 0)
                except Exception:
                    author = 0
                try:
                    conn = get_db_conn()
                    cur = conn.cursor()
                    cur.execute("INSERT INTO attachments (task_id, author_id, url, original_name) VALUES (%s,%s,%s,%s)", (task_id, author, data.get('url'), data.get('original_name')))
                    conn.commit()
                    cur.close()
                    self._set_headers(201)
                    self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
                except Exception as e:
                    self._set_headers(500)
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                finally:
                    try:
                        if 'cur' in locals() and getattr(cur, 'close', None):
                            try:
                                cur.close()
                            except Exception:
                                pass
                        if 'conn' in locals() and getattr(conn, 'close', None):
                            try:
                                conn.close()
                            except Exception:
                                pass
                    except Exception:
                        pass
                return

        # create a new task
        if self.path == "/tasks":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode("utf-8"))
                return

            # Only TEAM_LEADER may create tasks and they must be the leader of the team
            role = self.headers.get("X-User-Role", "MEMBER")
            try:
                user_id = int(self.headers.get("X-User-Id", "0"))
            except Exception:
                user_id = 0

            if role != "TEAM_LEADER":
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden: only TEAM_LEADER can create tasks"}).encode("utf-8"))
                return

            required = ["title", "priority", "due_date", "team_id"]
            if not all(field in data for field in required):
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Missing required fields (title, priority, due_date, team_id)"}).encode("utf-8"))
                return
            try:
                conn = get_db_conn()
                # verify user is leader of the provided team
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT leader_id FROM teams WHERE id=%s", (data.get("team_id"),))
                team_row = cur.fetchone()
                if not team_row or team_row.get('leader_id') != user_id:
                    self._set_headers(403)
                    self.wfile.write(json.dumps({"error": "Forbidden: only the team leader can create tasks for this team"}).encode("utf-8"))
                    cur.close()
                    conn.close()
                    return

                cur.close()
                cur = conn.cursor()
                cur.execute("INSERT INTO tasks (title, description, status, priority, due_date, team_id, created_by, assigned_to) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                            (data.get("title"), data.get("description"), data.get("status", "TODO"), data["priority"], data["due_date"], data.get("team_id"), user_id, data.get("assigned_to", None)))
                task_id = cur.lastrowid
                conn.commit()
                cur.close()
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT id, title, description, status, priority, due_date, team_id, created_by, assigned_to FROM tasks WHERE id=%s", (task_id,))
                task = cur.fetchone()
                self._set_headers(201)
                self.wfile.write(json.dumps(task, default=str).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    cur.close()
                    conn.close()
                except Exception:
                    pass
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

        

    def do_PUT(self):
        if self.path.startswith("/tasks/"):
            # Determine permissions for update:
            # - ADMIN can update any task
            # - TEAM_LEADER can update tasks for their team
            # - assigned user can update only the 'status' field
            role = self.headers.get("X-User-Role", "MEMBER")
            try:
                user_id = int(self.headers.get("X-User-Id", "0"))
            except Exception:
                user_id = 0

            try:
                task_id = int(self.path.split("/")[2])
            except Exception:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid task id"}).encode("utf-8"))
                return

            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode("utf-8"))
                return

            try:
                conn = get_db_conn()
                cur = conn.cursor(dictionary=True)
                # verify task exists and load team/assigned info
                cur.execute("SELECT team_id, assigned_to FROM tasks WHERE id=%s", (task_id,))
                trow = cur.fetchone()
                if not trow:
                    self._set_headers(404)
                    self.wfile.write(json.dumps({"error": "Task not found"}).encode("utf-8"))
                    cur.close()
                    conn.close()
                    return

                cur.execute("SELECT leader_id FROM teams WHERE id=%s", (trow.get('team_id'),))
                team_row = cur.fetchone()

                is_admin = (role == 'ADMIN')
                is_team_leader = (role == 'TEAM_LEADER' and team_row and team_row.get('leader_id') == user_id)
                is_assignee = (trow.get('assigned_to') is not None and int(trow.get('assigned_to')) == user_id)

                # if requester is admin or team leader, allow full update
                # otherwise, if requester is assignee, allow only status updates
                if not (is_admin or is_team_leader or is_assignee):
                    self._set_headers(403)
                    self.wfile.write(json.dumps({"error": "Forbidden: insufficient permissions to modify this task"}).encode("utf-8"))
                    cur.close()
                    conn.close()
                    return

                if is_assignee and not (set(data.keys()) <= {'status'}):
                    self._set_headers(403)
                    self.wfile.write(json.dumps({"error": "Assignee may only change status"}).encode("utf-8"))
                    cur.close()
                    conn.close()
                    return
                # build update dynamically
                fields = []
                values = []
                for k, v in data.items():
                    fields.append(f"{k}=%s")
                    values.append(v)
                if not fields:
                    self._set_headers(400)
                    self.wfile.write(json.dumps({"error": "No fields to update"}).encode("utf-8"))
                    return
                values.append(task_id)
                sql = f"UPDATE tasks SET {', '.join(fields)} WHERE id=%s"
                cur.execute(sql, tuple(values))
                conn.commit()
                cur.close()
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT id, title, description, status, priority, due_date, team_id, created_by, assigned_to FROM tasks WHERE id=%s", (task_id,))
                task = cur.fetchone()
                if not task:
                    self._set_headers(404)
                    self.wfile.write(json.dumps({"error": "Task not found"}).encode("utf-8"))
                    return
                self._set_headers(200)
                self.wfile.write(json.dumps(task, default=str).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    cur.close()
                    conn.close()
                except Exception:
                    pass
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def do_DELETE(self):
        if self.path.startswith("/tasks/"):
            # Allow ADMIN or TEAM_LEADER (leader of the task's team) to delete tasks
            role = self.headers.get("X-User-Role", "MEMBER")
            try:
                user_id = int(self.headers.get("X-User-Id", "0"))
            except Exception:
                user_id = 0

            try:
                task_id = int(self.path.split("/")[2])
            except Exception:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid task id"}).encode("utf-8"))
                return

            try:
                conn = get_db_conn()
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT team_id FROM tasks WHERE id=%s", (task_id,))
                trow = cur.fetchone()
                if not trow:
                    self._set_headers(404)
                    self.wfile.write(json.dumps({"error": "Task not found"}).encode("utf-8"))
                    cur.close()
                    conn.close()
                    return
                cur.execute("SELECT leader_id FROM teams WHERE id=%s", (trow.get('team_id'),))
                team_row = cur.fetchone()
                is_admin = (role == 'ADMIN')
                is_team_leader = (role == 'TEAM_LEADER' and team_row and team_row.get('leader_id') == user_id)
                if not (is_admin or is_team_leader):
                    self._set_headers(403)
                    self.wfile.write(json.dumps({"error": "Forbidden: only team leader or admin can delete this task"}).encode("utf-8"))
                    cur.close()
                    conn.close()
                    return

                cur.close()
                cur = conn.cursor()
                cur.execute("DELETE FROM tasks WHERE id=%s", (task_id,))
                conn.commit()
                if cur.rowcount == 0:
                    self._set_headers(404)
                    self.wfile.write(json.dumps({"error": "Task not found"}).encode("utf-8"))
                    return
                self._set_headers(204)
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    cur.close()
                    conn.close()
                except Exception:
                    pass
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))


def run(port=8082):
    # wait for DB to be reachable
    import time
    for _ in range(30):
        try:
            c = get_db_conn()
            c.close()
            break
        except Exception:
            time.sleep(1)
    # ensure tasks table has the new columns (safe migration for existing DBs)
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        db_name = os.getenv("DB_NAME", "pms")
        # helper to check if a column exists
        def column_exists(table, column):
            cur.execute("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=%s AND table_name=%s AND column_name=%s", (db_name, table, column))
            return cur.fetchone()[0] > 0

        alters = []
        if not column_exists('tasks', 'description'):
            alters.append("ADD COLUMN description TEXT")
        if not column_exists('tasks', 'created_by'):
            alters.append("ADD COLUMN created_by INT")
        if not column_exists('tasks', 'assigned_to'):
            alters.append("ADD COLUMN assigned_to INT")
        # created_at should be checked independently
        if not column_exists('tasks', 'created_at'):
            alters.append("ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP")

        if alters:
            sql = f"ALTER TABLE tasks {', '.join(alters)}"
            try:
                cur.execute(sql)
                conn.commit()
                print('Task table migrated:', sql)
            except Exception as e:
                print('Failed to migrate tasks table:', e)
        # ensure comments and attachments tables exist (safe create)
        try:
            cur.execute('''
                CREATE TABLE IF NOT EXISTS comments (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    task_id INT NOT NULL,
                    author_id INT,
                    content TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB
            ''')
            cur.execute('''
                CREATE TABLE IF NOT EXISTS attachments (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    task_id INT NOT NULL,
                    author_id INT,
                    url VARCHAR(1024),
                    original_name VARCHAR(255),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB
            ''')
            conn.commit()
        except Exception as e:
            print('Failed to ensure comments/attachments tables:', e)
        # ensure uploads directory exists for file attachments
        try:
            uploads_dir = os.path.join(os.path.dirname(__file__), 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
        except Exception:
            pass
        cur.close()
        conn.close()
    except Exception as e:
        print('Schema migration check failed:', e)

    server_address = ("", port)
    httpd = HTTPServer(server_address, TaskHandler)
    print(f"Task Service running on http://localhost:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    run()
