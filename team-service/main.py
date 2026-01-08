import json
from http.server import BaseHTTPRequestHandler, HTTPServer

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
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        if self.path == "/teams":
            self._set_headers(200)
            self.wfile.write(json.dumps(TEAMS).encode("utf-8"))
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

            required = ["name", "description"]
            if not all(field in data for field in required):
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Missing name or description"}).encode("utf-8"))
                return

            team = {
                "id": len(TEAMS) + 1,
                "name": data["name"],
                "description": data["description"],
                "leader_id": data.get("leader_id", 1),
                "members": data.get("members", [])
            }
            TEAMS.append(team)

            self._set_headers(201)
            self.wfile.write(json.dumps(team).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))


def run(port=8081):
    server_address = ("", port)
    httpd = HTTPServer(server_address, TeamHandler)
    print(f"Team Service running on http://localhost:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    run()
