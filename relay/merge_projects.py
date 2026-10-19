"""One shared action list: move every project's actions into one project (KCGM Actions, IDs ACT-0001...), numbered
by when each action was created. Each keeps its old ID (oldId, searchable, shown in its change history), gets an
owner (the person whose list it came from, unless it has one) and a change history line saying it moved. Photos,
thumbnails, attachments, RFQs and quotes move folder with it. The old projects stay in projects.json marked deleted,
so a computer with the old list cached drops them rather than putting them back.

  python3 relay/merge_projects.py <data repo folder>     (then commit and push the data repo)"""
import json, os, shutil, sys, time, random, string

ROOT = sys.argv[1]
NEW = {"id": "kcgm-actions", "name": "KCGM Actions", "prefix": "ACT", "color": "#475569"}
OWNERS = {"BIJ": "Bijan", "JAC": "Jack"}
P = lambda *x: os.path.join(ROOT, "data", *x)
uid = lambda: "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(14))
t = int(time.time() * 1000)

pj = json.load(open(P("projects.json")))
old = [p for p in pj["projects"] if not p.get("del") and p["id"] != NEW["id"]]
if not old: sys.exit("Nothing to merge")
acts = []
for p in old:
    d = json.load(open(P("p", p["id"], "actions.json")))
    for a in d["actions"]:
        a["_src"] = p
        acts.append(a)
live = [a for a in acts if not a.get("del")]
live.sort(key=lambda a: (a.get("created") or a.get("mod") or 0, a["_src"]["prefix"], a.get("no", 0)))
out = []
for i, a in enumerate(live, 1):
    p = a.pop("_src"); was = "%s-%04d" % (p["prefix"], a["no"])
    a["oldId"] = was; a["no"] = i
    if not a.get("owner") and OWNERS.get(p["prefix"]): a["owner"] = {"n": OWNERS[p["prefix"]]}
    a.setdefault("hist", []).append({"i": uid(), "t": t, "by": "Action Database", "c": [["Moved to the shared action list", was, "%s-%04d" % (NEW["prefix"], i)]]})
    a["mod"] = t; out.append(a)
nd = P("p", NEW["id"]); os.makedirs(nd, exist_ok=True)
for p in old:
    od = P("p", p["id"])
    for sub in os.listdir(od):
        s = os.path.join(od, sub)
        if not os.path.isdir(s): continue
        for dirpath, _, files in os.walk(s):
            for f in files:
                src = os.path.join(dirpath, f); dst = os.path.join(nd, os.path.relpath(src, od))
                os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.move(src, dst)
    shutil.rmtree(od)
json.dump({"v": 1, "nextNo": len(out) + 1, "actions": out}, open(os.path.join(nd, "actions.json"), "w"), indent=1, ensure_ascii=False)
for p in old: p["del"] = True; p["mod"] = t
pj["projects"].append(dict(NEW, created=t, mod=t, by="Action Database"))
json.dump(pj, open(P("projects.json"), "w"), indent=1, ensure_ascii=False)
print("merged", len(out), "actions from", ", ".join(p["name"] for p in old), "into", NEW["name"])
