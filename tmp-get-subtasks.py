import sys, json
data = json.load(sys.stdin)
for t in data['tasks']:
    if 'Security' in t['title']:
        print(f"Task: {t['id']}")
        for s in t['subtasks']:
            print(f"  {s['id']} | done={s['completed']} | {s['title'][:60]}")
