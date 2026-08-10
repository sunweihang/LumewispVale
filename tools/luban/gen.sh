#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONF_ROOT="$ROOT/SourceData"
OUT_CODE="$ROOT/assets/scripts/cfg"
OUT_DATA="$ROOT/assets/resources/config"
LUBAN_DLL="$SCRIPT_DIR/Luban/Luban.dll"

if ! command -v dotnet >/dev/null; then
  echo "Need .NET 8 runtime (dotnet)."
  exit 1
fi
if [[ ! -f "$LUBAN_DLL" ]]; then
  echo "Luban.dll missing at $LUBAN_DLL"
  exit 1
fi

# Prefer Homebrew/system pythons that already have openpyxl.
if command -v /usr/local/bin/python3 >/dev/null 2>&1; then
  PY=/usr/local/bin/python3
elif command -v python3 >/dev/null 2>&1; then
  PY=python3
else
  echo "python3 not found"
  exit 1
fi

# Rebuild Excel shells when SLG template Datas are available; otherwise use committed SourceData/Datas.
SLG_DATAS_DEFAULT="/Users/sunix/SLG/SourceData/SourceData/Datas"
if [[ -d "${SLG_LUBAN_DATAS:-$SLG_DATAS_DEFAULT}" ]]; then
  SLG_LUBAN_DATAS="${SLG_LUBAN_DATAS:-$SLG_DATAS_DEFAULT}" "$PY" "$SCRIPT_DIR/build_source_xlsx.py"
else
  echo "SLG template Datas not found; using committed SourceData/Datas"
fi

mkdir -p "$OUT_CODE" "$OUT_DATA"
# Remove previous generated outputs but keep .meta files Cocos needs.
find "$OUT_CODE" "$OUT_DATA" -type f ! -name '*.meta' -delete 2>/dev/null || true

dotnet "$LUBAN_DLL" \
  -t client \
  -c typescript-json \
  -d json \
  --conf "$CONF_ROOT/luban.conf" \
  -x outputCodeDir="$OUT_CODE" \
  -x outputDataDir="$OUT_DATA"

# Ensure Cocos metas exist for new files (uuid stable once created).
"$PY" - "$ROOT" <<'PY'
import json, sys, uuid
from pathlib import Path
root = Path(sys.argv[1])
pairs = [
    (root/"assets/scripts/cfg", "directory", "1.2.0", []),
    (root/"assets/scripts/cfg/schema.ts", "typescript", "1.0.8", [".js", ".ts"]),
]
for p in (root/"assets/resources/config").glob("*.json"):
    pairs.append((p, "json", "1.1.1", [".json"]))
for path, importer, ver, files in pairs:
    meta = Path(str(path) + ".meta") if path.suffix else Path(str(path) + ".meta")
    if path.is_dir():
        meta = Path(str(path) + ".meta")
    if meta.exists():
        continue
    meta.write_text(json.dumps({
        "ver": ver,
        "importer": importer,
        "imported": True,
        "uuid": str(uuid.uuid4()),
        "files": files,
        "subMetas": {},
        "userData": {},
    }, indent=2) + "\n")
    print("created", meta)
PY

echo "Generated code → $OUT_CODE"
echo "Generated data → $OUT_DATA"
