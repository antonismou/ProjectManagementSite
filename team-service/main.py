import json
import os
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

TEAMS = [
    # demo data
    {
        "id": 1,
        "name": "Development Team",
        "description": "Web Application Development",
        "leader_id": 1,
        "members": [1, 2, 3]
    },
    {
        "id": 2,
        "name": "QA Team",
        "description": "Quality Assurance",
        "leader_id": 4,
        "members": [4, 5]
    }
]


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
        # Support GET /teams (list) and GET /teams/<id> (single)
        if self.path == "/teams" or self.path.startswith("/teams/"):
            # identify requester from headers (prefer X-User-Role and X-User-Id set by gateway/frontend)
            role = self.headers.get("X-User-Role") or "MEMBER"
            try:
                requester_id = int(self.headers.get("X-User-Id") or 0)
            except Exception:
                requester_id = 0

            def fetch_user_details(conn, ids):
                # return list of user dicts for given ids
                if not ids:
                    return []
                try:
                    cur = conn.cursor(dictionary=True)
                    # build placeholders
                    placeholders = ','.join(['%s'] * len(ids))
                    cur.execute(f"SELECT id, username, email, first_name, last_name, role, active FROM users WHERE id IN ({placeholders})", tuple(ids))
                    rows = cur.fetchall()
                    cur.close()
                    return rows
                except Exception:
                    try:
                        cur.close()
                    except Exception:
                        pass
                    return []

            try:
                conn = get_db_conn()
                cur = conn.cursor(dictionary=True)

                # single team
                if self.path.startswith("/teams/") and self.path != "/teams":
                    parts = self.path.split('/')
                    try:
                        team_id = int(parts[2])
                    except Exception:
                        self._set_headers(400)
                        self.wfile.write(json.dumps({"error": "Invalid team id"}).encode("utf-8"))
                        return

                    cur.execute("SELECT id, name, description, leader_id, members, created_at FROM teams WHERE id=%s", (team_id,))
                    team = cur.fetchone()
                    if not team:
                        self._set_headers(404)
                        self.wfile.write(json.dumps({"error": "Team not found"}).encode("utf-8"))
                        return

                    # parse members
                    members = []
                    if team.get('members'):
                        try:
                            members = json.loads(team['members'])
                        except Exception:
                            members = []

                    allowed = False
                    if role == 'ADMIN':
                        allowed = True
                    if team.get('leader_id') and team.get('leader_id') == requester_id:
                        allowed = True
                    if requester_id and requester_id in members:
                        allowed = True

                    if not allowed:
                        self._set_headers(403)
                        self.wfile.write(json.dumps({"error": "Forbidden: not a member or leader"}).encode("utf-8"))
                        return

                    # expand member details
                    member_objs = fetch_user_details(conn, members)
                    team['members'] = member_objs
                    # optionally fetch leader details
                    if team.get('leader_id'):
                        leader_rows = fetch_user_details(conn, [team.get('leader_id')])
                        team['leader'] = leader_rows[0] if leader_rows else None

                    self._set_headers(200)
                    self.wfile.write(json.dumps(team, default=str).encode('utf-8'))
                    return

                # list teams: return only teams visible to requester (admins see all)
                cur.execute("SELECT id, name, description, leader_id, members, created_at FROM teams")
                rows = cur.fetchall()
                result = []
                for r in rows:
                    members = []
                    if r.get('members'):
                        try:
                            members = json.loads(r['members'])
                        except Exception:
                            members = []

                    visible = False
                    if role == 'ADMIN':
                        visible = True
                    if r.get('leader_id') and r.get('leader_id') == requester_id:
                        visible = True
                    if requester_id and requester_id in members:
                        visible = True

                    if visible:
                        # expand members to full user objects
                        member_objs = fetch_user_details(conn, members)
                        r['members'] = member_objs
                        # include leader object
                        if r.get('leader_id'):
                            leader_rows = fetch_user_details(conn, [r.get('leader_id')])
                            r['leader'] = leader_rows[0] if leader_rows else None
                        # ensure created_at is present for clients
                        if r.get('created_at'):
                            r['created_at'] = r.get('created_at')
                        result.append(r)

                self._set_headers(200)
                self.wfile.write(json.dumps(result, default=str).encode('utf-8'))
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
        if self.path == "/teams":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode("utf-8"))
                return
            # only ADMIN can create teams
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
                members_json = None
                if "members" in data:
                    members_json = json.dumps(data.get("members", []))
                conn = get_db_conn()
                cur = conn.cursor()
                cur.execute("INSERT INTO teams (name, description, leader_id, members) VALUES (%s,%s,%s,%s)",
                            (data["name"], data["description"], data.get("leader_id", None), members_json))
                team_id = cur.lastrowid
                conn.commit()
                cur.close()
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT id, name, description, leader_id, members FROM teams WHERE id=%s", (team_id,))
                team = cur.fetchone()
                if team and team.get("members"):
                    try:
                        team["members"] = json.loads(team["members"])
                    except Exception:
                        pass
                self._set_headers(201)
                self.wfile.write(json.dumps(team, default=str).encode("utf-8"))
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
        # Update a team: /teams/<id> - allowed for ADMIN or the team's leader (TEAM_LEADER with matching id)
        if self.path.startswith("/teams/"):
            try:
                team_id = int(self.path.split("/")[2])
            except Exception:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid team id"}).encode("utf-8"))
                return

            role = self.headers.get("X-User-Role", "MEMBER")
            try:
                user_id = int(self.headers.get("X-User-Id", "0"))
            except Exception:
                user_id = 0

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
                body = self.rfile.read(length)
                try:
                    data = json.loads(body.decode("utf-8"))
                except json.JSONDecodeError:
                    self._set_headers(400)
                    self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode("utf-8"))
                    return

                # Only ADMIN can change the leader_id field
                if "leader_id" in data and role != "ADMIN":
                    self._set_headers(403)
                    self.wfile.write(json.dumps({"error": "Only ADMIN can change team leader"}).encode("utf-8"))
                    return

                # Only the team's leader can modify the members list. Admins are not allowed to change members.
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
                    values.append(json.dumps(data["members"]))

                if not fields:
                    self._set_headers(400)
                    self.wfile.write(json.dumps({"error": "No fields to update"}).encode("utf-8"))
                    return

                values.append(team_id)
                sql = f"UPDATE teams SET {', '.join(fields)} WHERE id=%s"
                cur2 = conn.cursor()
                cur2.execute(sql, tuple(values))
                conn.commit()
                cur2.close()
                cur.execute("SELECT id, name, description, leader_id, members FROM teams WHERE id=%s", (team_id,))
                updated = cur.fetchone()
                if updated and updated.get("members"):
                    try:
                        updated["members"] = json.loads(updated["members"])
                    except Exception:
                        pass
                self._set_headers(200)
                self.wfile.write(json.dumps(updated, default=str).encode("utf-8"))
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
        # Delete a team: only ADMIN
        if self.path.startswith("/teams/"):
            role = self.headers.get("X-User-Role", "MEMBER")
            if role != "ADMIN":
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden: only ADMIN can delete teams"}).encode("utf-8"))
                return

            try:
                team_id = int(self.path.split("/")[2])
            except Exception:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid team id"}).encode("utf-8"))
                return

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
                    cur.close()
                    conn.close()
                except Exception:
                    pass
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))


def run(port=8081):
    # wait for DB to be reachable
    import time
    for _ in range(30):
        try:
            c = get_db_conn()
            c.close()
            break
        except Exception:
            time.sleep(1)

    # ensure DB schema is compatible (safe migration)
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        # check if `created_at` exists on teams
        try:
            cur.execute("SELECT created_at FROM teams LIMIT 1")
        except Exception:
            # attempt to add the column if missing
            try:
                cur.execute("ALTER TABLE teams ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP")
                conn.commit()
                print('team-service: added created_at column to teams')
            except Exception as e:
                print('team-service: failed to add created_at column to teams:', e)
        try:
            cur.close()
            conn.close()
        except Exception:
            pass
    except Exception:
        # if DB unreachable, the earlier wait loop should have handled it; continue anyway
        pass

    server_address = ("", port)
    httpd = HTTPServer(server_address, TeamHandler)
    print(f"Team Service running on http://localhost:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    run()
