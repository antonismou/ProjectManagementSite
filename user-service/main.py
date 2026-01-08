import json
from http.server import BaseHTTPRequestHandler, HTTPServer

USERS = []  # προσωρινά στη μνήμη


class UserHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
        if self.path == "/users":
            self._set_headers(200)
            self.wfile.write(json.dumps(USERS).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def handle_signup(self, data):
        required = ["username", "email", "first_name", "last_name", "password"]
        if not all(field in data and data[field] for field in required):
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Missing fields"}).encode("utf-8"))
            return

        # έλεγχος αν υπάρχει ήδη username
        for u in USERS:
            if u["username"] == data["username"]:
                self._set_headers(409)
                self.wfile.write(json.dumps({"error": "Username already exists"}).encode("utf-8"))
                return

        user = {
            "id": len(USERS) + 1,
            "username": data["username"],
            "email": data["email"],
            "first_name": data["first_name"],
            "last_name": data["last_name"],
            "password": data["password"],  # για τώρα plain text
            "role": "MEMBER",
            "active": True  # για να μην μπλέξουμε ακόμα με approval
        }
        USERS.append(user)

        self._set_headers(201)
        safe_user = user.copy()
        safe_user.pop("password")
        self.wfile.write(json.dumps(safe_user).encode("utf-8"))

    def handle_login(self, data):
        username = data.get("username")
        password = data.get("password")
        if not username or not password:
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Missing username or password"}).encode("utf-8"))
            return

        found = None
        for u in USERS:
            if u["username"] == username and u["password"] == password and u["active"]:
                found = u
                break

        if not found:
            self._set_headers(401)
            self.wfile.write(json.dumps({"error": "Invalid credentials or inactive user"}).encode("utf-8"))
            return

        # απλό fake token
        token = f"token-{found['id']}"
        self._set_headers(200)
        safe_user = found.copy()
        safe_user.pop("password")
        self.wfile.write(json.dumps({"token": token, "user": safe_user}).encode("utf-8"))


def run(port=8080):
    server_address = ("", port)
    httpd = HTTPServer(server_address, UserHandler)
    print(f"User Service running on http://localhost:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    run()
