import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import mysql.connector.pooling

# db_pool will be initialized in the run() function
db_pool = None

def get_db_conn():
    if db_pool is None:
        raise Exception("Database connection pool not initialized.")
    return db_pool.get_connection()

class TeamHandler(BaseHTTPRequestHandler):
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
        
        if path == "/teams/count":
            # Accessible to any authenticated user
            if not self.headers.get("X-User-Id"):
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Unauthorized"}).encode("utf-8"))
                return
            
            conn = None
            cur = None
            try:
                conn = get_db_conn()
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT COUNT(*) as count FROM teams")
                result = cur.fetchone()
                self._set_headers(200)
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    if 'cur' in locals() and cur:
                        cur.close()
                    if 'conn' in locals() and conn: 
                        conn.close()
                except Exception:
                    pass
            return

        if path == "/teams" or path.startswith("/teams/"):
            role = self.headers.get("X-User-Role") or "MEMBER"
            try:
                requester_id = int(self.headers.get("X-User-Id") or 0)
            except Exception:
                requester_id = 0

            conn = None
            cur = None
            try:
                conn = get_db_conn()
                cur = conn.cursor(dictionary=True)

                if path.startswith("/teams/") and path != "/teams":
                    try:
                        team_id = int(path.split('/')[-1])
                    except ValueError:
                        self._set_headers(400)
                        self.wfile.write(json.dumps({"error": "Invalid team id"}).encode("utf-8"))
                        return

                    cur.execute("SELECT id, name, description, leader_id, members, created_at FROM teams WHERE id=%s", (team_id,))
                    team = cur.fetchone()
                    if not team:
                        self._set_headers(404)
                        self.wfile.write(json.dumps({"error": "Team not found"}).encode("utf-8"))
                        return

                    members = self._parse_members(team.get('members'))
                    all_user_ids = set(members)
                    if team.get('leader_id'):
                        all_user_ids.add(team['leader_id'])
                    
                    user_map = self._fetch_user_details_map(conn, list(all_user_ids))

                    if team.get('leader_id') and team['leader_id'] in user_map:
                        team['leader'] = user_map[team['leader_id']]
                    team['members'] = [user_map[uid] for uid in members if uid in user_map]
                    # Return members as comma-separated string for frontend compatibility if needed, or list
                    team['members'] = ",".join(map(str, members))

                    self._set_headers(200)
                    self.wfile.write(json.dumps(team, default=str).encode('utf-8'))
                    return

                # list teams
                # Check for query params (e.g. ?ids=1,2,3) though usually handled by user-service, 
                # but if we want to filter teams by ID:
                query_params = parse_qs(parsed_path.query)
                if 'ids' in query_params:
                    ids_str = query_params['ids'][0]
                    try:
                        team_ids = [int(x) for x in ids_str.split(',')]
                        if not team_ids:
                             self._set_headers(200)
                             self.wfile.write(json.dumps([]).encode('utf-8'))
                             return
                        placeholders = ','.join(['%s'] * len(team_ids))
                        cur.execute(f"SELECT id, name, description, leader_id, members, created_at FROM teams WHERE id IN ({placeholders})", tuple(team_ids))
                    except ValueError:
                        self._set_headers(400)
                        self.wfile.write(json.dumps({"error": "Invalid ids parameter"}).encode("utf-8"))
                        return
                else:
                    cur.execute("SELECT id, name, description, leader_id, members, created_at FROM teams")
                
                all_teams = cur.fetchall()
                
                all_user_ids = set()
                for team in all_teams:
                    members = self._parse_members(team.get('members'))
                    if team.get('leader_id'):
                        all_user_ids.add(team['leader_id'])
                    all_user_ids.update(members)
                
                user_map = self._fetch_user_details_map(conn, list(all_user_ids))

                result = []
                for team in all_teams:
                    members = self._parse_members(team.get('members'))
                    
                    visible = False
                    if role == 'ADMIN':
                        visible = True
                    if team.get('leader_id') == requester_id:
                        visible = True
                    if requester_id in members:
                        visible = True
                    
                    # For simplicity, let's allow viewing all teams in the list, 
                    # or restrict if needed. The prompt implies "view to see all members", 
                    # suggesting listing might be open or role-based.
                    # Current logic restricts visibility.
                    # If ids are requested specifically, maybe allow?
                    if 'ids' in query_params:
                        visible = True 

                    if visible:
                        if team.get('leader_id') and team['leader_id'] in user_map:
                            team['leader'] = user_map[team['leader_id']]
                        team['members'] = ",".join(map(str, members))
                        result.append(team)

                self._set_headers(200)
                self.wfile.write(json.dumps(result, default=str).encode('utf-8'))
            except Exception as e:
                print(f"Error in do_GET: {e}") # Debug log
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    if 'cur' in locals() and cur:
                        cur.close()
                    if 'conn' in locals() and conn: # conn.is_connected() is not needed for pooled connections, just close it to return to pool
                        conn.close()
                except Exception:
                    pass
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def _parse_members(self, members_raw):
        if not members_raw:
            return []
        try:
            parsed = json.loads(members_raw)
            if isinstance(parsed, list):
                return [int(x) for x in parsed]
            if isinstance(parsed, int):
                return [parsed]
            if isinstance(parsed, str):
                if ',' in parsed:
                    return [int(x.strip()) for x in parsed.split(',') if x.strip()]
                if parsed.isdigit():
                    return [int(parsed)]
                return []
        except json.JSONDecodeError:
            if isinstance(members_raw, str):
                 return [int(x.strip()) for x in members_raw.split(',') if x.strip().isdigit()]
            return []
        except Exception:
            return []

    def _fetch_user_details_map(self, conn, ids):
        if not ids:
            return {}
        cur = conn.cursor(dictionary=True)
        valid_ids = [i for i in ids if isinstance(i, int)]
        if not valid_ids:
            return {}
        placeholders = ','.join(['%s'] * len(valid_ids))
        cur.execute(f"SELECT id, username, email, first_name, last_name, role, active FROM users WHERE id IN ({placeholders})", tuple(valid_ids))
        rows = cur.fetchall()
        cur.close()
        return {row['id']: row for row in rows}

    def do_POST(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        if path == "/teams":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode("utf-8"))
                return
            
            role = self.headers.get("X-User-Role", "MEMBER")
            if role != "ADMIN":
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden: only ADMIN can create teams"}).encode("utf-8"))
                return

            required = ["name", "description"]
            if not all(field in data for field in required):
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Missing name or description"}).encode("utf-8"))
                return

            try:
                members_list = []
                if "members" in data:
                    raw_members = data["members"]
                    if isinstance(raw_members, list):
                        members_list = raw_members
                    elif isinstance(raw_members, str):
                         members_list = [int(x.strip()) for x in raw_members.split(',') if x.strip().isdigit()]
                    elif isinstance(raw_members, int):
                        members_list = [raw_members]
                
                members_json = json.dumps(members_list)

                conn = get_db_conn()
                cur = conn.cursor()
                cur.execute("INSERT INTO teams (name, description, leader_id, members) VALUES (%s,%s,%s,%s)",
                            (data["name"], data["description"], data.get("leader_id", None), members_json))
                team_id = cur.lastrowid
                conn.commit()
                cur.close()
                
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT id, name, description, leader_id, members, created_at FROM teams WHERE id=%s", (team_id,))
                team = cur.fetchone()

                members = self._parse_members(team.get('members'))
                all_user_ids = set(members)
                if team.get('leader_id'):
                    all_user_ids.add(team['leader_id'])
                
                user_map = self._fetch_user_details_map(conn, list(all_user_ids))

                if team.get('leader_id') and team['leader_id'] in user_map:
                    team['leader'] = user_map[team['leader_id']]
                
                team['members'] = ",".join(map(str, members))

                self._set_headers(201)
                self.wfile.write(json.dumps(team, default=str).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    if 'cur' in locals() and cur:
                        cur.close()
                    if 'conn' in locals() and conn: 
                        conn.close()
                except Exception:
                    pass
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def do_PUT(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        if path.startswith("/teams/"):
            try:
                team_id = int(path.split('/')[-1])
            except (IndexError, ValueError):
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid team id"}).encode("utf-8"))
                return

            role = self.headers.get("X-User-Role", "MEMBER")
            try:
                user_id = int(self.headers.get("X-User-Id") or 0)
            except Exception:
                user_id = 0

            conn = None
            cur = None
            try:
                conn = get_db_conn()
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT id, leader_id FROM teams WHERE id=%s", (team_id,))
                team = cur.fetchone()
                if not team:
                    self._set_headers(404)
                    self.wfile.write(json.dumps({"error": "Team not found"}).encode("utf-8"))
                    return

                if role != "ADMIN" and not (role == "TEAM_LEADER" and team.get("leader_id") == user_id):
                    self._set_headers(403)
                    self.wfile.write(json.dumps({"error": "Forbidden: insufficient role or not team leader"}).encode("utf-8"))
                    return

                length = int(self.headers.get("Content-Length", 0))
                data = json.loads(self.rfile.read(length))

                if "leader_id" in data and role != "ADMIN":
                    self._set_headers(403)
                    self.wfile.write(json.dumps({"error": "Only ADMIN can change team leader"}).encode("utf-8"))
                    return

                if "members" in data and not (role == "TEAM_LEADER" and team.get("leader_id") == user_id):
                    self._set_headers(403)
                    self.wfile.write(json.dumps({"error": "Only the team leader can modify members"}).encode("utf-8"))
                    return

                fields = []
                values = []
                if "name" in data:
                    fields.append("name=%s")
                    values.append(data["name"])
                if "description" in data:
                    fields.append("description=%s")
                    values.append(data["description"])
                if "leader_id" in data:
                    fields.append("leader_id=%s")
                    values.append(data["leader_id"])
                if "members" in data:
                    fields.append("members=%s")
                    raw_members = data["members"]
                    members_list = []
                    if isinstance(raw_members, list):
                        members_list = raw_members
                    elif isinstance(raw_members, str):
                         members_list = [int(x.strip()) for x in raw_members.split(',') if x.strip().isdigit()]
                    elif isinstance(raw_members, int):
                        members_list = [raw_members]
                    values.append(json.dumps(members_list))

                if not fields:
                    self._set_headers(400)
                    self.wfile.write(json.dumps({"error": "No fields to update"}).encode("utf-8"))
                    return

                values.append(team_id)
                cur.execute(f"UPDATE teams SET {', '.join(fields)} WHERE id=%s", tuple(values))
                conn.commit()

                if "leader_id" in data and data["leader_id"] is not None:
                    new_leader_id = int(data["leader_id"])
                    user_cur = conn.cursor(dictionary=True)
                    user_cur.execute("SELECT role FROM users WHERE id=%s", (new_leader_id,))
                    user_to_promote = user_cur.fetchone()
                    user_cur.close()
                    if user_to_promote and user_to_promote['role'] == 'MEMBER':
                        update_cur = conn.cursor()
                        update_cur.execute("UPDATE users SET role='TEAM_LEADER' WHERE id=%s", (new_leader_id,))
                        conn.commit()
                        update_cur.close()

                self._set_headers(200)
                self.wfile.write(json.dumps({"status": "ok"}).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    if 'cur' in locals() and cur:
                        cur.close()
                    if 'conn' in locals() and conn: 
                        conn.close()
                except Exception:
                    pass
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def do_DELETE(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        if path.startswith("/teams/"):
            role = self.headers.get("X-User-Role", "MEMBER")
            if role != "ADMIN":
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden: only ADMIN can delete teams"}).encode("utf-8"))
                return

            try:
                team_id = int(path.split('/')[-1])
            except (IndexError, ValueError):
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid team id"}).encode("utf-8"))
                return

            conn = None
            cur = None
            try:
                conn = get_db_conn()
                cur = conn.cursor()
                cur.execute("DELETE FROM teams WHERE id=%s", (team_id,))
                conn.commit()
                if cur.rowcount == 0:
                    self._set_headers(404)
                    self.wfile.write(json.dumps({"error": "Team not found"}).encode("utf-8"))
                    return
                self._set_headers(204)
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    if 'cur' in locals() and cur:
                        cur.close()
                    if 'conn' in locals() and conn: 
                        conn.close()
                except Exception:
                    pass
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))


def run(port=8081):
    import time
    global db_pool # Declare db_pool as global
    conn = None
    cur = None
    for _ in range(30): # Retry database connection for up to 30 seconds
        try:
            db_pool = mysql.connector.pooling.MySQLConnectionPool(
                pool_name="team_service_pool",
                pool_size=5, # You can adjust this based on your expected load
                host=os.getenv("DB_HOST", "localhost"),
                user=os.getenv("DB_USER", "root"),
                password=os.getenv("DB_PASS", ""),
                database=os.getenv("DB_NAME", "pms"),
                autocommit=True
            )
            conn = get_db_conn() # Get a connection from the newly initialized pool
            cur = conn.cursor()
            db_name = os.getenv("DB_NAME", "pms")
            
            cur.execute("SHOW COLUMNS FROM teams LIKE 'created_at'")
            column_exists = cur.fetchone() # Consume the result
            if not column_exists:
                cur.execute("ALTER TABLE teams ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP")
                conn.commit()
                print("team-service: added created_at column to teams")
            
            cur.close()
            conn.close()
            print("Team Service: Successfully connected to the database pool and checked schema.")
            break
        except Exception as e:
            print(f"Team Service: Waiting for database or checking schema... ({e})")
            time.sleep(1)
        # Removed the redundant 'finally' block here to prevent double-closing connections
    else:
        print("Team Service: Could not connect to the database or check schema after multiple attempts. Exiting.")
        return # Exit if unable to connect to DB

    server_address = ("", port)
    httpd = HTTPServer(server_address, TeamHandler)
    print(f"Team Service running on http://localhost:{port}")
    httpd.serve_forever()

if __name__ == "__main__":
    run()