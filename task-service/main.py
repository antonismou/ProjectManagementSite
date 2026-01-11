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
                        self.wfile.write(fh.read())
                    return
                except Exception as e:
                    self._set_headers(500)
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                    return
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "File not found"}).encode('utf-8'))
            return

        if self.path == "/tasks" or self.path.startswith('/tasks/'):
            try:
                conn = get_db_conn()
                cur = conn.cursor(dictionary=True)
                if self.path == '/tasks':
                    cur.execute("SELECT id, title, description, status, priority, due_date, team_id, created_by, assigned_to, created_at FROM tasks")
                    rows = cur.fetchall()
                    self._set_headers(200)
                    self.wfile.write(json.dumps(rows, default=str).encode("utf-8"))
                else: # GET /tasks/<id>
                    task_id = int(self.path.split('/')[-1])
                    cur.execute("SELECT id, title, description, status, priority, due_date, team_id, created_by, assigned_to, created_at FROM tasks WHERE id=%s", (task_id,))
                    task = cur.fetchone()
                    if not task:
                        self._set_headers(404)
                        self.wfile.write(json.dumps({"error": "Task not found"}).encode("utf-8"))
                        return

                    ccur = conn.cursor(dictionary=True)
                    ccur.execute("SELECT id, author_id, content, created_at FROM comments WHERE task_id=%s ORDER BY created_at ASC", (task_id,))
                    task['comments'] = ccur.fetchall()
                    ccur.execute("SELECT id, author_id, url, original_name, created_at FROM attachments WHERE task_id=%s ORDER BY created_at ASC", (task_id,))
                    task['attachments'] = ccur.fetchall()
                    ccur.close()
                    
                    self._set_headers(200)
                    self.wfile.write(json.dumps(task, default=str).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    if 'cur' in locals():
                        cur.close()
                    if 'conn' in locals() and conn.is_connected():
                        conn.close()
                except Exception:
                    pass
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def do_POST(self):
        if self.path.startswith('/tasks/') and self.path.endswith('/attachments'):
            self.handle_attachment_upload()
            return
        
        if self.path == "/tasks":
            self.handle_task_creation()
            return
        
        if self.path.startswith('/tasks/') and self.path.endswith('/comments'):
            self.handle_comment_creation()
            return

        self._set_headers(404)
        self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def handle_attachment_upload(self):
        try:
            task_id = int(self.path.split('/')[-2])
        except (IndexError, ValueError):
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Invalid task id"}).encode("utf-8"))
            return
        
        ctype = self.headers.get('Content-Type', '')
        if not ctype.startswith('multipart/form-data'):
            self._set_headers(415)
            self.wfile.write(json.dumps({"error": "Unsupported Media Type"}).encode('utf-8'))
            return

        print("--- ATTACHMENT UPLOAD START ---")
        print(f"Content-Type: {ctype}")
        try:
            length = int(self.headers.get('Content-Length', 0))
            fs = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={'REQUEST_METHOD':'POST', 'CONTENT_TYPE': ctype, 'CONTENT_LENGTH': str(length)})
            print(f"cgi.FieldStorage keys: {fs.keys()}")

            filefield = fs['file'] if 'file' in fs else None
            if filefield is None or not filefield.filename:
                print("File field is missing or has no filename.")
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "No file provided"}).encode('utf-8'))
                return
            
            filename = filefield.filename
            print(f"Received filename: {filename}")
            ext = os.path.splitext(filename)[1]
            safe_name = f"{uuid.uuid4().hex}{ext}"
            uploads_dir = os.path.join(os.path.dirname(__file__), 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            filepath = os.path.join(uploads_dir, safe_name)

            with open(filepath, 'wb') as out:
                out.write(filefield.file.read())
            
            print(f"Saved file to: {filepath}")
            url = f"/files/{safe_name}"
            author_id = int(self.headers.get('X-User-Id', 0))
            original_name = fs.getvalue('original_name', filename)

            conn = get_db_conn()
            cur = conn.cursor()
            cur.execute("INSERT INTO attachments (task_id, author_id, url, original_name) VALUES (%s, %s, %s, %s)", (task_id, author_id, url, original_name))
            conn.commit()
            cur.close()
            conn.close()

            self._set_headers(201)
            self.wfile.write(json.dumps({"status": "ok", "url": url}).encode('utf-8'))
            print("--- ATTACHMENT UPLOAD END ---")
        except Exception as e:
            print(f"--- ATTACHMENT UPLOAD FAILED: {e} ---")
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

    def handle_task_creation(self):
        # ... (implementation for creating a task)
        pass

    def handle_comment_creation(self):
        # ... (implementation for creating a comment)
        pass

    def do_PUT(self):
        if not self.path.startswith("/tasks/"):
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))
            return

        try:
            task_id = int(self.path.split('/')[-1])
            length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(length))
            
            role = self.headers.get("X-User-Role", "MEMBER")
            user_id = int(self.headers.get("X-User-Id", "0"))

            conn = get_db_conn()
            cur = conn.cursor(dictionary=True)
            cur.execute("SELECT team_id, assigned_to FROM tasks WHERE id=%s", (task_id,))
            task = cur.fetchone()
            if not task:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Task not found"}).encode("utf-8"))
                return
            
            cur.execute("SELECT leader_id FROM teams WHERE id=%s", (task['team_id'],))
            team = cur.fetchone()

            is_admin = (role == 'ADMIN')
            is_leader = (role == 'TEAM_LEADER' and team and team['leader_id'] == user_id)
            is_assignee = (task['assigned_to'] is not None and task['assigned_to'] == user_id)

            if not (is_admin or is_leader or is_assignee):
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden"}).encode("utf-8"))
                return

            fields, values = [], []
            if is_assignee:
                if 'status' in data:
                    fields.append("status=%s")
                    values.append(data['status'])
                elif len(data) > 1 or 'status' not in data:
                    self._set_headers(403)
                    self.wfile.write(json.dumps({"error": "Assignee may only change status"}).encode("utf-8"))
                    return
            else: # Admin or Team Leader
                allowed_fields = ['title', 'description', 'status', 'priority', 'due_date', 'assigned_to']
                for field in allowed_fields:
                    if field in data:
                        fields.append(f"{field}=%s")
                        values.append(data[field])
            
            if not fields:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "No valid fields to update"}).encode("utf-8"))
                return
            
            values.append(task_id)
            cur.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id=%s", tuple(values))
            conn.commit()

            cur.execute("SELECT * FROM tasks WHERE id=%s", (task_id,))
            updated_task = cur.fetchone()
            cur.close()
            conn.close()

            self._set_headers(200)
            self.wfile.write(json.dumps(updated_task, default=str).encode("utf-8"))
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

def run(port=8082):
    server_address = ("", port)
    httpd = HTTPServer(server_address, TaskHandler)
    print(f"Task Service running on http://localhost:{port}")
    httpd.serve_forever()

if __name__ == "__main__":
    run()
