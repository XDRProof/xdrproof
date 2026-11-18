import json, sys
label = sys.argv[1]
d = json.load(sys.stdin)
print(f"{label}: {d['files']} files, {d['records']} ledgers, arms hit {d['arms_hit']} / {d['arms_total']}, "
      f"enum members {d['enum_hit']} / {d['enum_total']}, decode errors {len(d.get('errors', []))}")
