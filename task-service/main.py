import json
import os
import cgi
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import mysql.connector.pooling
import requests
from datetime import datetime

USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://user-service:8080")
TEAM_SERVICE_URL = os.getenv("TEAM_SERVICE_URL", "http://team-service:8081") # Assuming team service URL

# db_pool will be initialized in the run() function
db_pool = None

def get_db_conn():
    if db_pool is None:
        raise Exception("Database connection pool not initialized.")
    return db_pool.get_connection()

# Helper function to parse request body
def parse_request_body(handler):
    length = int(handler.headers.get("Content-Length", 0))
    body = handler.rfile.read(length)
    try:
        return json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        handler._set_headers(400, "application/json")
        handler.wfile.write(json.dumps({"error": "Invalid JSON payload"}).encode("utf-8"))
        return None

# Helper function for database operations
def execute_query(query, params=None, fetch_one=False, fetch_all=False, dictionary=True):
    conn = None
    cur = None
    try:
        conn = get_db_conn()
        cur = conn.cursor(dictionary=dictionary)
        cur.execute(query, params or ())
        if fetch_all:
            result = cur.fetchall()
            return result
        elif fetch_one:
            result = cur.fetchone()
            return result
        else: # For INSERT, UPDATE, DELETE
            conn.commit()
            return {"lastrowid": cur.lastrowid} if "INSERT" in query else {"rowcount": cur.rowcount}
    except Exception as e:
        print(f"Database error: {e}")
        raise e
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# Helper function to fetch user details
def get_user_details(user_ids, handler=None):
    if not user_ids:
        return {}
    
    user_ids_str = ",".join(map(str, user_ids))
    try:
        headers = {}
        if handler: # Pass relevant headers if available
            if handler.headers.get("X-User-Id"):
                headers["X-User-Id"] = handler.headers.get("X-User-Id")
            if handler.headers.get("X-User-Role"):
                headers["X-User-Role"] = handler.headers.get("X-User-Role")

        response = requests.get(f"{USER_SERVICE_URL}/users?ids={user_ids_str}", headers=headers)
        response.raise_for_status()
        users_data = response.json()
        
        # Map user ID to user details (username specifically)
        user_map = {user['id']: user for user in users_data}
        return user_map
    except requests.exceptions.RequestException as e:
        print(f"Error fetching user details for IDs {user_ids_str}: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response Status Code: {e.response.status_code}")
            print(f"Response Text: {e.response.text}")
        return {} # Return empty dict if fetching fails

# Helper function to fetch team details
def get_team_details(team_ids, handler=None):
    if not team_ids:
        return {}
    
    team_ids_str = ",".join(map(str, team_ids))
    try:
        headers = {}
        if handler: # Pass relevant headers if available
            if handler.headers.get("X-User-Id"):
                headers["X-User-Id"] = handler.headers.get("X-User-Id")
            if handler.headers.get("X-User-Role"):
                headers["X-User-Role"] = handler.headers.get("X-User-Role")

        response = requests.get(f"{TEAM_SERVICE_URL}/teams?ids={team_ids_str}", headers=headers)
        response.raise_for_status()
        teams_data = response.json()
        
        team_map = {team['id']: team for team in teams_data}
        return team_map
    except requests.exceptions.RequestException as e:
        print(f"Error fetching team details for IDs {team_ids_str}: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response Status Code: {e.response.status_code}")
            print(f"Response Text: {e.response.text}")
        return {}


class TaskServiceHandler(BaseHTTPRequestHandler):
    
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
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        if path.startswith('/files/'):
            self.handle_file_serving(path)
            return

        if path == "/tasks" or path.startswith('/tasks/'):
            self.handle_get_tasks(parsed_path)
            return
        
        self._set_headers(404)
        self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def handle_file_serving(self, path):
        fname = path.split('/files/', 1)[1]
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
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "File not found"}).encode('utf-8'))

    def handle_get_tasks(self, parsed_path):
        try:
            path = parsed_path.path
            query_params = parse_qs(parsed_path.query)
            
            token = self.headers.get("Authorization", "").split(" ")[-1]
            user_id = int(self.headers.get("X-User-Id", 0))
            user_role = self.headers.get("X-User-Role", "MEMBER")
            
            query = "SELECT t.* FROM tasks t"
            params = []

            if path == '/tasks':
                conditions = []
                if 'teamId' in query_params:
                    conditions.append("t.team_id = %s")
                    params.append(int(query_params['teamId'][0]))
                
                if conditions:
                    query += " WHERE " + " AND ".join(conditions)
                    
            elif path.startswith('/tasks/') and len(path) > 7: 
                # Check if what follows /tasks/ is just an ID (no further slashes)
                # path[7:] is the part after /tasks/
                subpath = path[7:]
                if '/' not in subpath:
                    try:
                        task_id = int(subpath)
                        query += " WHERE t.id = %s"
                        params.append(task_id)
                    except ValueError:
                         self._set_headers(404)
                         self.wfile.write(json.dumps({"error": "Invalid task ID format"}).encode("utf-8"))
                         return
                else:
                    # Could be /tasks/1/comments etc, but handle_get_tasks shouldn't be called for those if routed properly?
                    # Actually do_GET routes /tasks... here.
                    # But wait, comments/attachments are sub-resources but typically GET /tasks/{id} returns them embedded.
                    # So we just need to match /tasks/{id} exactly here.
                    self._set_headers(404)
                    self.wfile.write(json.dumps({"error": "Invalid task path structure"}).encode("utf-8"))
                    return
            else:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Invalid task path"}).encode("utf-8"))
                return

            # Fetch tasks
            tasks_data = execute_query(query + " ORDER BY t.created_at DESC", params, fetch_all=True, dictionary=True)
            
            if not tasks_data and path != '/tasks': # If fetching single task and not found
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Task not found"}).encode("utf-8"))
                return

            # Fetch related data (users, teams, comments, attachments) if needed
            all_task_ids = [t['id'] for t in tasks_data] if tasks_data else []
            if all_task_ids:
                # Fetch comments and attachments
                placeholders = ','.join(['%s'] * len(all_task_ids))
                
                comments_query = f"SELECT c.*, u.username as author_username FROM comments c LEFT JOIN users u ON c.author_id = u.id WHERE c.task_id IN ({placeholders}) ORDER BY c.created_at ASC"
                comments_data = execute_query(comments_query, tuple(all_task_ids), fetch_all=True, dictionary=True)
                
                attachments_query = f"SELECT a.* FROM attachments a WHERE a.task_id IN ({placeholders}) ORDER BY a.created_at ASC"
                attachments_data = execute_query(attachments_query, tuple(all_task_ids), fetch_all=True, dictionary=True)

                # Group comments and attachments by task_id
                comments_by_task = {task_id: [] for task_id in all_task_ids}
                for comment in comments_data:
                    if comment['task_id'] in comments_by_task:
                        comments_by_task[comment['task_id']].append(comment)

                attachments_by_task = {task_id: [] for task_id in all_task_ids}
                for attachment in attachments_data:
                    if attachment['task_id'] in attachments_by_task:
                        attachments_by_task[attachment['task_id']].append(attachment)

                # Fetch user details for assignees and creators
                user_ids_to_fetch = set()
                for task in tasks_data:
                    if task.get('created_by'): user_ids_to_fetch.add(task['created_by'])
                    if task.get('assigned_to'): user_ids_to_fetch.add(task['assigned_to'])
                
                user_map = get_user_details(list(user_ids_to_fetch), handler=self)

                # Fetch team details
                team_ids_to_fetch = set(t['team_id'] for t in tasks_data if t.get('team_id'))
                team_map = get_team_details(list(team_ids_to_fetch), handler=self)

                # Assemble final data
                for task in tasks_data:
                    task['comments'] = comments_by_task.get(task['id'], [])
                    task['attachments'] = attachments_by_task.get(task['id'], [])
                    task['created_by_details'] = user_map.get(task.get('created_by'))
                    task['assigned_to_details'] = user_map.get(task.get('assigned_to'))
                    task['team_details'] = team_map.get(task.get('team_id'))

            # If GET /tasks/{id}, return single task
            if path != '/tasks' and tasks_data:
                task_data = tasks_data[0]
                self._set_headers(200)
                self.wfile.write(json.dumps(task_data, default=str).encode("utf-8"))
            else: # GET /tasks, return list
                self._set_headers(200)
                self.wfile.write(json.dumps(tasks_data, default=str).encode("utf-8"))
        except Exception as e:
            print(f"Error in handle_get_tasks: {e}")
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def do_POST(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        if path.startswith('/tasks/'):
            if path.endswith('/attachments'):
                self.handle_attachment_upload(path)
            elif path.endswith('/comments'):
                self.handle_comment_creation(path)
            else: # POST /tasks
                self.handle_task_creation()
        elif path == "/tasks":
             self.handle_task_creation()
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def handle_task_creation(self):
        data = parse_request_body(self)
        if not data:
            return

        required_fields = ["title", "description", "team_id"]
        if not all(field in data and data[field] for field in required_fields):
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Missing required fields (title, description, team_id)"}).encode("utf-8"))
            return

        created_by = int(self.headers.get("X-User-Id", "0"))
        if not created_by:
            self._set_headers(401)
            self.wfile.write(json.dumps({"error": "Unauthorized: X-User-Id header missing"}).encode("utf-8"))
            return
        
        try:
            inserted_task = execute_query(
                """
                INSERT INTO tasks (title, description, status, priority, due_date, team_id, created_by, assigned_to) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    data["title"],
                    data["description"],
                    data.get("status", "TODO"),
                    data.get("priority", "MEDIUM"),
                    data.get("due_date"),
                    data["team_id"],
                    created_by,
                    data.get("assigned_to")
                )
            )
            task_id = inserted_task.get("lastrowid")

            # Fetch the newly created task to return
            new_task = execute_query("SELECT * FROM tasks WHERE id=%s", (task_id,), fetch_one=True, dictionary=True)
            
            self._set_headers(201)
            self.wfile.write(json.dumps(new_task, default=str).encode("utf-8"))

        except Exception as e:
            print(f"Error in handle_task_creation: {e}")
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def handle_comment_creation(self, path):
        try:
            task_id = int(path.split('/')[-2])
        except (IndexError, ValueError):
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Invalid task ID in path"}).encode("utf-8"))
            return
        
        data = parse_request_body(self)
        if not data:
            return

        content = data.get("content")
        author_id = int(self.headers.get("X-User-Id", "0"))

        if not content:
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Comment content is required"}).encode("utf-8"))
            return
        if not author_id:
            self._set_headers(401)
            self.wfile.write(json.dumps({"error": "Unauthorized: X-User-Id header missing"}).encode("utf-8"))
            return
        
        try:
            # Fetch author username from user-service
            user_map = get_user_details([author_id], handler=self)
            author_username = user_map.get(author_id, {}).get('username', 'Unknown')
            
            inserted_comment = execute_query(
                "INSERT INTO comments (task_id, author_id, content, author_username) VALUES (%s, %s, %s, %s)",
                (task_id, author_id, content, author_username)
            )
            comment_id = inserted_comment.get("lastrowid")

            # Fetch the newly created comment to return
            new_comment = execute_query("SELECT c.*, u.username as author_username FROM comments c LEFT JOIN users u ON c.author_id = u.id WHERE c.id=%s", (comment_id,), fetch_one=True, dictionary=True)
            
            self._set_headers(201)
            self.wfile.write(json.dumps(new_comment, default=str).encode("utf-8"))

        except Exception as e:
            print(f"Error in handle_comment_creation: {e}")
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def handle_attachment_upload(self, path):
        try:
            task_id = int(path.split('/')[-2])
        except (IndexError, ValueError):
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Invalid task ID in path"}).encode("utf-8"))
            return
        
        content_type = self.headers.get('Content-Type', '')
        print(f"DEBUG: handle_attachment_upload - Content-Type: {content_type}")
        
        if 'multipart/form-data' not in content_type:
            self._set_headers(415)
            self.wfile.write(json.dumps({"error": f"Unsupported Media Type, must be multipart/form-data. Received: {content_type}"}).encode('utf-8'))
            return

        try:
            length = int(self.headers.get('Content-Length', 0))
            # Use FieldStorage which handles the multipart parsing
            fs = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={'REQUEST_METHOD':'POST', 'CONTENT_TYPE': content_type})
            
            filefield = fs['file'] if 'file' in fs else None
            if filefield is None or not filefield.filename:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "No file provided in 'file' field"}).encode('utf-8'))
                return
            
            filename = os.path.basename(filefield.filename)
            ext = os.path.splitext(filename)[1]
            safe_name = f"{uuid.uuid4().hex}{ext}"
            uploads_dir = os.path.join(os.path.dirname(__file__), 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            filepath = os.path.join(uploads_dir, safe_name)

            with open(filepath, 'wb') as out:
                out.write(filefield.file.read())
            
            url = f"/files/{safe_name}"
            author_id = int(self.headers.get('X-User-Id', 0))
            original_name = fs.getvalue('original_name', filename) # Use provided original_name if available

            inserted_attachment = execute_query(
                "INSERT INTO attachments (task_id, author_id, url, original_name) VALUES (%s, %s, %s, %s)",
                (task_id, author_id, url, original_name)
            )
            attachment_id = inserted_attachment.get("lastrowid")

            # Fetch the newly created attachment to return
            new_attachment = execute_query("SELECT * FROM attachments WHERE id=%s", (attachment_id,), fetch_one=True, dictionary=True)
            
            self._set_headers(201)
            self.wfile.write(json.dumps(new_attachment, default=str).encode('utf-8'))
        except Exception as e:
            print(f"Error in handle_attachment_upload: {e}")
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

    def do_PUT(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        if not path.startswith("/tasks/"):
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))
            return

        try:
            task_id = int(path.split('/')[-1])
            data = parse_request_body(self)
            if not data:
                return

            role = self.headers.get("X-User-Role", "MEMBER")
            user_id = int(self.headers.get("X-User-Id", "0"))

            # Fetch current task details for validation
            current_task = execute_query("SELECT t.*, te.leader_id FROM tasks t JOIN teams te ON t.team_id = te.id WHERE t.id=%s", (task_id,), fetch_one=True, dictionary=True)
            if not current_task:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Task not found"}).encode("utf-8"))
                return

            is_admin = (role == 'ADMIN')
            is_leader = (role == 'TEAM_LEADER' and current_task.get('leader_id') == user_id)
            is_assignee = (current_task.get('assigned_to') is not None and current_task.get('assigned_to') == user_id)
            is_creator = (current_task.get('created_by') == user_id)

            # Determine which fields are updatable by the current user
            allowed_fields = {}
            if is_admin or is_leader:
                allowed_fields = {
                    'title': str, 'description': str, 'status': str, 
                    'priority': str, 'due_date': str, 'assigned_to': int, 'team_id': int
                }
            elif is_assignee:
                allowed_fields = {'status': str} # Assignee can only change status
            elif is_creator: # Creator might have more permissions, but for simplicity, let's stick to assignee/admin/leader roles for now
                 allowed_fields = {} # Or define specific creator permissions if needed
            else:
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden: insufficient permissions"}).encode("utf-8"))
                return

            updates = {}
            for field, field_type in allowed_fields.items():
                if field in data:
                    # Basic type validation
                    try:
                        if field_type == int:
                            value = int(data[field]) if data[field] is not None else None
                        elif field_type == str:
                            value = str(data[field]).strip() if data[field] is not None else None
                        elif field_type == date: # Assuming due_date is handled as string then parsed
                            value = data[field] 
                        else: # For ENUMs like status, priority, ensure they are valid if provided
                            if field == 'status' and data[field] not in ['TODO', 'IN_PROGRESS', 'DONE']:
                                raise ValueError("Invalid status value")
                            if field == 'priority' and data[field] not in ['LOW', 'MEDIUM', 'HIGH']:
                                raise ValueError("Invalid priority value")
                            value = data[field]
                        
                        if value is not None: # Only include fields that are explicitly provided and valid
                            updates[field] = value
                    except (ValueError, TypeError) as ve:
                        self._set_headers(400)
                        self.wfile.write(json.dumps({"error": f"Invalid value for field '{field}': {ve}"}).encode("utf-8"))
                        return
            
            if not updates:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "No valid fields provided for update"}).encode("utf-8"))
                return
            
            # Build SET clause for SQL query
            set_clause = ", ".join([f"{field}=%s" for field in updates.keys()])
            values = list(updates.values())
            values.append(task_id)

            update_query = f"UPDATE tasks SET {set_clause} WHERE id=%s"
            execute_query(update_query, tuple(values))

            # Fetch the updated task to return
            updated_task = execute_query("SELECT * FROM tasks WHERE id=%s", (task_id,), fetch_one=True, dictionary=True)
            
            self._set_headers(200)
            self.wfile.write(json.dumps(updated_task, default=str).encode("utf-8"))
        except Exception as e:
            print(f"Error in do_PUT: {e}")
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def do_DELETE(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        if not path.startswith("/tasks/"):
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))
            return
        
        try:
            task_id = int(path.split('/')[-1])
            role = self.headers.get("X-User-Role", "MEMBER")
            user_id = int(self.headers.get("X-User-Id", "0"))

            # Fetch current task details to check permissions
            current_task = execute_query("SELECT created_by, team_id FROM tasks WHERE id=%s", (task_id,), fetch_one=True, dictionary=True)
            if not current_task:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Task not found"}).encode("utf-8"))
                return

            # Fetch team leader ID
            team_leader_info = execute_query("SELECT leader_id FROM teams WHERE id=%s", (current_task['team_id'],), fetch_one=True, dictionary=True)
            team_leader_id = team_leader_info.get('leader_id') if team_leader_info else None

            # Permissions: Admin, Team Leader, or Creator can delete
            if not (role == 'ADMIN' or (role == 'TEAM_LEADER' and team_leader_id == user_id) or (current_task.get('created_by') == user_id)):
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden: insufficient permissions to delete this task"}).encode("utf-8"))
                return

            # Delete task (cascade delete for comments and attachments is handled by DB foreign key constraint)
            execute_query("DELETE FROM tasks WHERE id=%s", (task_id,))
            
            self._set_headers(200)
            self.wfile.write(json.dumps({"message": "Task deleted successfully"}).encode("utf-8"))

        except Exception as e:
            print(f"Error in do_DELETE: {e}")
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))


def run(port=8082):
    import time
    global db_pool
    
    # Database connection retry loop
    for _ in range(30): # Retry for up to 30 seconds
        try:
            if db_pool is None:
                db_pool = mysql.connector.pooling.MySQLConnectionPool(
                    pool_name="task_service_pool",
                    pool_size=5,
                    host=os.getenv("DB_HOST", "localhost"),
                    user=os.getenv("DB_USER", "root"),
                    password=os.getenv("DB_PASS", ""),
                    database=os.getenv("DB_NAME", "pms"),
                    autocommit=True
                )
            # Test connection
            conn = get_db_conn()
            cur = conn.cursor()
            cur.execute("SELECT 1") 
            cur.fetchall() # Consume result
            cur.close()
            conn.close() 
            print("Task Service: Successfully connected to the database pool.")
            break
        except Exception as e:
            print(f"Task Service: Waiting for database... ({e})")
            time.sleep(1)
    else:
        print("Task Service: Could not connect to the database after multiple attempts. Exiting.")
        return # Exit if unable to connect to DB

    server_address = ("", port)
    httpd = HTTPServer(server_address, TaskServiceHandler)
    print(f"Task Service running on http://localhost:{port}")
    httpd.serve_forever()

if __name__ == "__main__":
    run()