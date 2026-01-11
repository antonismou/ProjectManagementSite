import json
import os
import cgi
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


class UserHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        # include DELETE so browsers can preflight and allow DELETE requests from the frontend
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Role, X-User-Id")
        self.end_headers()

    def do_OPTIONS(self):
        # CORS preflight
        self._set_headers(200)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode("utf-8"))
            return

        if self.path == "/signup":
            self.handle_signup(data)
        elif self.path == "/login":
            self.handle_login(data)
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def do_GET(self):
        # GET /users -> list all users (ADMIN only)
        if self.path == "/users":
            # check requester is ADMIN
            auth = self.headers.get("Authorization", "")
            requester = None
            if auth.startswith("Bearer token-"):
                try:
                    rid = int(auth.split("-")[-1])
                    conn = get_db_conn()
                    cur = conn.cursor(dictionary=True)
                    cur.execute("SELECT id, role FROM users WHERE id=%s", (rid,))
                    requester = cur.fetchone()
                except Exception:
                    requester = None
                finally:
                    try:
                        cur.close()
                        conn.close()
                    except Exception:
                        pass

            if not requester or requester.get("role") != "ADMIN":
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden: admin only"}).encode("utf-8"))
                return

            try:
                conn = get_db_conn()
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT id, username, email, first_name, last_name, role, active FROM users")
                rows = cur.fetchall()
                self._set_headers(200)
                self.wfile.write(json.dumps(rows, default=str).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    cur.close()
                    conn.close()
                except Exception:
                    pass

        # GET /users/public -> list minimal user info for selection (available to authenticated users)
        elif self.path == "/users/public":
            # require a user id header (set by frontend via X-User-Id) or Authorization
            header_uid = self.headers.get('X-User-Id') or self.headers.get('Authorization')
            if not header_uid:
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden"}).encode('utf-8'))
                return
            try:
                conn = get_db_conn()
                cur = conn.cursor(dictionary=True)
                # return only minimal fields for dropdowns
                cur.execute("SELECT id, username, first_name, last_name, active FROM users ORDER BY username ASC")
                rows = cur.fetchall()
                self._set_headers(200)
                self.wfile.write(json.dumps(rows, default=str).encode('utf-8'))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            finally:
                try:
                    cur.close()
                    conn.close()
                except Exception:
                    pass

        # GET /users/ids=<id1,id2,...> -> list minimal user info for selection by IDs
        elif self.path.startswith("/users?") and "ids=" in self.path:
            query_string = self.path.split('?', 1)[1]
            query_params = {k: v[0] for k, v in cgi.parse_qs(query_string).items()}
            
            ids_str = query_params.get("ids")
            if not ids_str:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Missing 'ids' query parameter"}).encode("utf-8"))
                return

            try:
                user_ids = [int(i) for i in ids_str.split(',')]
            except ValueError:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid 'ids' format"}).encode("utf-8"))
                return

            # require a user id header (set by frontend via X-User-Id) or Authorization
            header_uid = self.headers.get('X-User-Id') or self.headers.get('Authorization')
            if not header_uid:
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden"}).encode('utf-8'))
                return

            conn = None
            cur = None
            try:
                conn = get_db_conn()
                cur = conn.cursor(dictionary=True)
                placeholders = ','.join(['%s'] * len(user_ids))
                cur.execute(f"SELECT id, username, first_name, last_name, active FROM users WHERE id IN ({placeholders})", tuple(user_ids))
                rows = cur.fetchall()
                self._set_headers(200)
                self.wfile.write(json.dumps(rows, default=str).encode('utf-8'))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    if cur:
                        cur.close()
                    if conn:
                        conn.close()
                except Exception:
                    pass

        # GET /users/<id> -> view single user (ADMIN or the user themself)
        elif self.path.startswith("/users/"):
            parts = self.path.split("/")
            try:
                user_id = int(parts[2])
            except Exception:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid user id"}).encode("utf-8"))
                return

            auth = self.headers.get("Authorization", "")
            requester = None
            if auth.startswith("Bearer token-"):
                try:
                    rid = int(auth.split("-")[-1])
                    conn = get_db_conn()
                    cur = conn.cursor(dictionary=True)
                    cur.execute("SELECT id, role FROM users WHERE id=%s", (rid,))
                    requester = cur.fetchone()
                except Exception:
                    requester = None
                finally:
                    try:
                        cur.close()
                        conn.close()
                    except Exception:
                        pass

            allowed = False
            if requester and requester.get("role") == "ADMIN":
                allowed = True
            if requester and requester.get("id") == user_id:
                allowed = True

            if not allowed:
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden"}).encode("utf-8"))
                return

            try:
                conn = get_db_conn()
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT id, username, email, first_name, last_name, role, active FROM users WHERE id=%s", (user_id,))
                user = cur.fetchone()
                if not user:
                    self._set_headers(404)
                    self.wfile.write(json.dumps({"error": "User not found"}).encode("utf-8"))
                    return
                self._set_headers(200)
                self.wfile.write(json.dumps(user, default=str).encode("utf-8"))
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
        # Support updating a user's role: PUT /users/<id>/role  with body {"role": "ADMIN"}
        if self.path.startswith("/users/") and self.path.endswith("/role"):
            parts = self.path.split("/")
            try:
                user_id = int(parts[2])
            except Exception:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid user id"}).encode("utf-8"))
                return

            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode("utf-8"))
                return

            new_role = data.get("role")
            if new_role not in ("ADMIN", "TEAM_LEADER", "MEMBER"):
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid role"}).encode("utf-8"))
                return

            # Simple auth: only an ADMIN user (based on Authorization token) can change roles
            auth = self.headers.get("Authorization", "")
            requester = None
            if auth.startswith("Bearer token-"):
                try:
                    rid = int(auth.split("-")[-1])
                    conn = get_db_conn()
                    cur = conn.cursor(dictionary=True)
                    cur.execute("SELECT id, role FROM users WHERE id=%s", (rid,))
                    requester = cur.fetchone()
                except Exception:
                    requester = None
                finally:
                    try:
                        cur.close()
                        conn.close()
                    except Exception:
                        pass

            if not requester or requester.get("role") != "ADMIN":
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Only ADMIN can change roles"}).encode("utf-8"))
                return

            try:
                conn = get_db_conn()
                cur = conn.cursor()
                cur.execute("UPDATE users SET role=%s WHERE id=%s", (new_role, user_id))
                conn.commit()
                cur.close()
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT id, username, email, first_name, last_name, role, active FROM users WHERE id=%s", (user_id,))
                user = cur.fetchone()
                self._set_headers(200)
                self.wfile.write(json.dumps(user, default=str).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            finally:
                try:
                    cur.close()
                    conn.close()
                except Exception:
                    pass
        # Support updating a user's active status: PUT /users/<id>/active with body {"active": true}
        elif self.path.startswith("/users/") and self.path.endswith("/active"):
            parts = self.path.split("/")
            try:
                user_id = int(parts[2])
            except Exception:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid user id"}).encode("utf-8"))
                return

            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode("utf-8"))
                return

            new_active = data.get("active")
            if not isinstance(new_active, bool):
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid active value"}).encode("utf-8"))
                return

            # Only ADMIN can change active status
            auth = self.headers.get("Authorization", "")
            requester = None
            if auth.startswith("Bearer token-"):
                try:
                    rid = int(auth.split("-")[-1])
                    conn = get_db_conn()
                    cur = conn.cursor(dictionary=True)
                    cur.execute("SELECT id, role FROM users WHERE id=%s", (rid,))
                    requester = cur.fetchone()
                except Exception:
                    requester = None
                finally:
                    try:
                        cur.close()
                        conn.close()
                    except Exception:
                        pass

            if not requester or requester.get("role") != "ADMIN":
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Only ADMIN can change active status"}).encode("utf-8"))
                return

            try:
                conn = get_db_conn()
                cur = conn.cursor()
                cur.execute("UPDATE users SET active=%s WHERE id=%s", (new_active, user_id))
                conn.commit()
                cur.close()
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT id, username, email, first_name, last_name, role, active FROM users WHERE id=%s", (user_id,))
                user = cur.fetchone()
                self._set_headers(200)
                self.wfile.write(json.dumps(user, default=str).encode("utf-8"))
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
        # DELETE /users/<id> -> delete user (ADMIN only)
        if self.path.startswith("/users/"):
            parts = self.path.split("/")
            try:
                user_id = int(parts[2])
            except Exception:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid user id"}).encode("utf-8"))
                return

            # check admin
            auth = self.headers.get("Authorization", "")
            requester = None
            if auth.startswith("Bearer token-"):
                try:
                    rid = int(auth.split("-")[-1])
                    conn = get_db_conn()
                    cur = conn.cursor(dictionary=True)
                    cur.execute("SELECT id, role FROM users WHERE id=%s", (rid,))
                    requester = cur.fetchone()
                except Exception:
                    requester = None
                finally:
                    try:
                        cur.close()
                        conn.close()
                    except Exception:
                        pass

            if not requester or requester.get("role") != "ADMIN":
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden: admin only"}).encode("utf-8"))
                return

            try:
                conn = get_db_conn()
                cur = conn.cursor()
                cur.execute("DELETE FROM users WHERE id=%s", (user_id,))
                conn.commit()
                if cur.rowcount == 0:
                    self._set_headers(404)
                    self.wfile.write(json.dumps({"error": "User not found"}).encode("utf-8"))
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

    def handle_signup(self, data):
        required = ["username", "email", "first_name", "last_name", "password"]
        if not all(field in data and data[field] for field in required):
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Missing fields"}).encode("utf-8"))
            return

        try:
            conn = get_db_conn()
            cur = conn.cursor()
            # New users should be inactive until an ADMIN activates them
            cur.execute("INSERT INTO users (username, email, first_name, last_name, password, role, active) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                        (data["username"], data["email"], data["first_name"], data["last_name"], data["password"], "MEMBER", False))
            user_id = cur.lastrowid
            conn.commit()
            cur.close()
            cur = conn.cursor(dictionary=True)
            cur.execute("SELECT id, username, email, first_name, last_name, role, active FROM users WHERE id=%s", (user_id,))
            user = cur.fetchone()
            self._set_headers(201)
            self.wfile.write(json.dumps(user, default=str).encode("utf-8"))
        except mysql.connector.IntegrityError:
            self._set_headers(409)
            self.wfile.write(json.dumps({"error": "Username already exists"}).encode("utf-8"))
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        finally:
            try:
                cur.close()
                conn.close()
            except Exception:
                pass

    def handle_login(self, data):
        username = data.get("username")
        password = data.get("password")
        if not username or not password:
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Missing username or password"}).encode("utf-8"))
            return

        try:
            conn = get_db_conn()
            cur = conn.cursor(dictionary=True)
            cur.execute("SELECT id, username, email, first_name, last_name, role, active FROM users WHERE username=%s AND password=%s AND active=1", (username, password))
            found = cur.fetchone()
            if not found:
                self._set_headers(401)
                self.wfile.write(json.dumps({"error": "Invalid credentials or inactive user"}).encode("utf-8"))
                return

            token = f"token-{found['id']}"
            self._set_headers(200)
            self.wfile.write(json.dumps({"token": token, "user": found}, default=str).encode("utf-8"))
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        finally:
            try:
                cur.close()
                conn.close()
            except Exception:
                pass


def run(port=8080):
    # wait for DB to be reachable (simple retry) to reduce startup race with MySQL container
    import time
    for _ in range(30):
        try:
            c = get_db_conn()
            c.close()
            break
        except Exception:
            time.sleep(1)
    server_address = ("", port)
    httpd = HTTPServer(server_address, UserHandler)
    print(f"User Service running on http://localhost:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    run()
