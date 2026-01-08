import json
from http.server import BaseHTTPRequestHandler, HTTPServer

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
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        if self.path == "/tasks":
            self._set_headers(200)
            self.wfile.write(json.dumps(TASKS).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def do_POST(self):
        if self.path == "/tasks":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode("utf-8"))
                return

            required = ["title", "priority", "due_date"]
            if not all(field in data for field in required):
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Missing required fields"}).encode("utf-8"))
                return

            task = {
                "id": len(TASKS) + 1,
                "title": data["title"],
                "status": data.get("status", "TODO"),
                "priority": data["priority"],
                "due_date": data["due_date"],
                "team_id": data.get("team_id", 1)
            }
            TASKS.append(task)

            self._set_headers(201)
            self.wfile.write(json.dumps(task).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def do_PUT(self):
        if self.path.startswith("/tasks/"):
            task_id = int(self.path.split("/")[2])
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode("utf-8"))
                return

            # βρες task και update
            for task in TASKS:
                if task["id"] == task_id:
                    task.update(data)
                    self._set_headers(200)
                    self.wfile.write(json.dumps(task).encode("utf-8"))
                    return

            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Task not found"}).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))


def run(port=8082):
    server_address = ("", port)
    httpd = HTTPServer(server_address, TaskHandler)
    print(f"Task Service running on http://localhost:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    run()
