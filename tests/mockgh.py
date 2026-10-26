"""Stand in for the GitHub API (only the calls the app makes), plus static files.
/app/...   the app folder      /store/... the committed repo files     /am/... the ActionMap clone
/api/repos/o/r/...  git data API."""
import base64, hashlib, json, os, sys, threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote

APP, STORE, AM, PORT = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
lock = threading.Lock()
state = {"head": "c0", "commits": {"c0": {}}, "blobs": {}, "trees": {}, "n": 0, "patches": 0}
os.makedirs(STORE, exist_ok=True)

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body=b"", ctype="application/json"):
        if isinstance(body, (dict, list)): body = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(body)
    def static(self, root, rel):
        p = os.path.join(root, unquote(rel))
        if os.path.isdir(p): p = os.path.join(p, "index.html")
        if not os.path.isfile(p): return self.send(404, {"message": "Not Found"})
        ext = p.rsplit(".", 1)[-1].lower()
        ct = {"html": "text/html", "js": "text/javascript", "css": "text/css", "json": "application/json", "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg"}.get(ext, "application/octet-stream")
        self.send(200, open(p, "rb").read(), ct)
    def do_GET(self):
        u = urlparse(self.path); path = u.path
        if path.startswith("/app/"): return self.static(APP, path[5:])
        if path.startswith("/store/"): return self.static(STORE, path[7:])
        if path.startswith("/am/"): return self.static(AM, path[4:])
        parts = path.split("/")
        if path.startswith("/api/repos/"):
            rest = "/".join(parts[5:])
            if rest == "": return self.send(200, {"default_branch": "main", "permissions": {"push": True}})
            if rest.startswith("contents/"):
                p = os.path.join(STORE, unquote(rest[9:]))
                if not os.path.isfile(p): return self.send(404, {"message": "Not Found"})
                raw = open(p, "rb").read()
                if "raw" not in (self.headers.get("Accept") or "") and "?ref=" not in self.path: return self.send(200, {"sha": hashlib.sha1(raw).hexdigest(), "content": base64.b64encode(raw).decode()})
                return self.send(200, raw, "text/plain")
            if rest == "git/ref/heads/main": return self.send(200, {"object": {"sha": state["head"]}})
            if rest.startswith("git/commits/"): return self.send(200, {"tree": {"sha": "t-" + rest[12:]}})
        self.send(404, {"message": "Not Found"})
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); body = json.loads(self.rfile.read(n) or b"{}"); rest = "/".join(urlparse(self.path).path.split("/")[5:])
        with lock:
            if rest == "git/blobs":
                data = base64.b64decode(body["content"]); sha = hashlib.sha1(data).hexdigest(); state["blobs"][sha] = data; return self.send(201, {"sha": sha})
            if rest == "git/trees":
                state["n"] += 1; tid = "tree%d" % state["n"]; state["trees"][tid] = body["tree"]; return self.send(201, {"sha": tid})
            if rest == "git/commits":
                state["n"] += 1; cid = "c%d" % state["n"]; state["commits"][cid] = {"tree": body["tree"], "parent": body["parents"][0], "msg": body["message"]}; return self.send(201, {"sha": cid})
        self.send(404, {})
    def do_PUT(self):
        n = int(self.headers.get("Content-Length", 0)); body = json.loads(self.rfile.read(n) or b"{}"); rest = "/".join(urlparse(self.path).path.split("/")[5:])
        if rest.startswith("contents/"):
            p = os.path.join(STORE, unquote(rest[9:])); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "wb").write(base64.b64decode(body["content"])); return self.send(200, {"content": {}})
        self.send(404, {})
    def do_PATCH(self):
        n = int(self.headers.get("Content-Length", 0)); body = json.loads(self.rfile.read(n) or b"{}")
        with lock:
            c = state["commits"].get(body["sha"])
            if not c or c["parent"] != state["head"]: return self.send(422, {"message": "Update is not a fast forward"})
            for e in state["trees"][c["tree"]]:
                p = os.path.join(STORE, e["path"]); os.makedirs(os.path.dirname(p), exist_ok=True)
                if e.get("sha") is None and "content" not in e:
                    if os.path.exists(p): os.remove(p)
                    continue
                data = e["content"].encode() if "content" in e else state["blobs"][e["sha"]]
                open(p, "wb").write(data)
            state["head"] = body["sha"]; state["patches"] += 1
            open(os.path.join(STORE, ".commits.log"), "a").write(c["msg"] + "\n")
        self.send(200, {"object": {"sha": body["sha"]}})

ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
