#!/usr/bin/env bash
# Muestra quién entró y qué hizo, y cuándo (volumen del servicio: access-log.jsonl).
# Requiere estar linkeado con `railway link` al proyecto re.mind2.
set -euo pipefail

LOG_PATH="${1:-/app/user_tokens/access-log.jsonl}"

railway ssh cat "$LOG_PATH" | while IFS= read -r linea; do
  [ -z "$linea" ] && continue
  echo "$linea" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['ts'], d['email'], d['event'], d.get('row',''))"
done
