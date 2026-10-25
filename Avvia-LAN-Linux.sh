#!/bin/sh
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)" || exit 1
if command -v python3 >/dev/null 2>&1; then
  python3 server.py
else
  printf '%s\n' 'Serve Python 3.10 o successivo. Installalo e riprova.'
fi
printf '%s' 'Premi Invio per chiudere.'
read -r apexgp_close
