#!/usr/bin/env bash
# CI heuristic (R-DB-02): flag awaited writes inside for/forEach/map loops in client code.
# Heuristic only — a reviewer confirms each hit. Whitelist with  allow-loop-write: <reason>
python3 - "${1:-src}" <<'PY'
import os,re,sys
root=sys.argv[1]; hits=[]
loop=re.compile(r'\b(for\s*\(|\.forEach\(|\.map\(\s*async)')
write=re.compile(r'await\s+[^;]*\.(insert|update|upsert|delete|rpc)\(')
for d,_,fs in os.walk(root):
  for f in fs:
    if not f.endswith(('.ts','.tsx','.js','.jsx')) or '.test.' in f: continue
    lines=open(os.path.join(d,f),encoding='utf-8',errors='ignore').read().splitlines()
    for i,l in enumerate(lines):
      if loop.search(l):
        for j in range(i+1,min(i+25,len(lines))):
          if write.search(lines[j]) and 'allow-loop-write:' not in lines[j]:
            hits.append(f"{os.path.join(d,f)}:{j+1}: {lines[j].strip()}"); break
if hits:
  print("Possible client-side write loop (R-DB-02):"); print("\n".join(hits)); sys.exit(1)
PY
