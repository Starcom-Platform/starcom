#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[baseline] Globe interactivity structural baseline"
echo "[baseline] repo: $ROOT_DIR"
echo

echo "--- Top 15 largest TS/TSX files ---"
find src \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 wc -l | sort -nr | head -n 15

echo
echo "--- Interactivity file sizes ---"
for file in \
  src/components/Globe/Enhanced3DGlobeInteractivity.tsx \
  src/components/Globe/Globe.tsx; do
  if [[ -f "$file" ]]; then
    lines=$(wc -l < "$file" | tr -d ' ')
    echo "$lines $file"
  fi
done | sort -nr

# P6: Legacy files archived — verify they are NOT in production location
for retired in \
  src/components/Globe/EnhancedGlobeInteractivity.tsx \
  src/components/Globe/EnhancedGlobeInteractivityV2.tsx; do
  if [[ -f "$retired" ]]; then
    echo "WARNING: Retired legacy file still present: $retired"
  fi
done

echo
echo "--- Enhanced3DGlobeInteractivity complexity counters ---"
TARGET="src/components/Globe/Enhanced3DGlobeInteractivity.tsx"
if [[ -f "$TARGET" ]]; then
  effects=$(grep -c 'useEffect(' "$TARGET" || true)
  callbacks=$(grep -c 'useCallback(' "$TARGET" || true)
  memos=$(grep -c 'useMemo(' "$TARGET" || true)
  states=$(grep -c 'useState(' "$TARGET" || true)
  echo "useEffect:  $effects"
  echo "useCallback:$callbacks"
  echo "useMemo:    $memos"
  echo "useState:   $states"
fi

echo
echo "--- Runtime usage check ---"
if [[ -f src/components/Globe/Globe.tsx ]]; then
  grep -n 'Enhanced3DGlobeInteractivity' src/components/Globe/Globe.tsx || true
fi

echo
echo "[baseline] complete"
