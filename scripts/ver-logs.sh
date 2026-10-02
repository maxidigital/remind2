#!/usr/bin/env bash
# Muestra quién entró y qué hizo, y cuándo: una línea por evento del access-log.
#
#   ./scripts/ver-logs.sh              # prod (Railway), todo el log
#   ./scripts/ver-logs.sh -f           # prod, en vivo (tail -f)
#   ./scripts/ver-logs.sh -l           # local (./user_tokens/access-log.jsonl)
#   ./scripts/ver-logs.sh -l -f
#   ./scripts/ver-logs.sh | grep note.delete
#
# Prod usa `railway ssh` con el proyecto/servicio explícitos, así que NO toca el
# `railway link` global. Requiere la sesión del CLI de Railway iniciada.
set -euo pipefail

# `railway ssh -p` solo acepta el ID del proyecto: con el nombre ("re.mind2")
# falla con "Project not found" (a diferencia de `railway deployment list`).
# Para sacar los IDs: railway list --json
PROJECT="dad8a73a-6466-456a-818f-21dfe1aeb5a4"  # re.mind2
SERVICE="underwater"
ENVIRONMENT="production"
REMOTE_PATH="/app/user_tokens/access-log.jsonl"
LOCAL_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/user_tokens/access-log.jsonl"

follow=false
local=false
for arg in "$@"; do
  case "$arg" in
    -f|--follow) follow=true ;;
    -l|--local)  local=true ;;
    -h|--help)   sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

# Da formato: {ts,email,event,row?} -> "ts  email  event  row"
fmt() {
  while IFS= read -r linea; do
    [ -z "$linea" ] && continue
    printf '%s\n' "$linea" | python3 -c "import json,sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('ts',''), d.get('email',''), d.get('event',''), d.get('row',''))
except Exception:
    pass"
  done
}

if $local; then
  [ -f "$LOCAL_PATH" ] || { echo "no existe $LOCAL_PATH (¿corriste la app en local?)" >&2; exit 1; }
  if $follow; then tail -n +1 -f "$LOCAL_PATH" | fmt; else cat "$LOCAL_PATH" | fmt; fi
else
  cmd=(railway ssh -p "$PROJECT" -s "$SERVICE" -e "$ENVIRONMENT")
  if $follow; then "${cmd[@]}" tail -n +1 -f "$REMOTE_PATH" | fmt; else "${cmd[@]}" cat "$REMOTE_PATH" | fmt; fi
fi
