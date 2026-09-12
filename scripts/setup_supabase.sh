#!/usr/bin/env bash

set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "${script_dir}/.." && pwd)"
env_file="${SUPABASE_ENV_FILE:-${project_dir}/backend/.env}"
schema_file="${project_dir}/backend/supabase/schema.sql"
seed_articles=true

if [[ "${1:-}" == "--schema-only" ]]; then
  seed_articles=false
elif [[ -n "${1:-}" ]]; then
  echo "Usage: bash scripts/setup_supabase.sh [--schema-only]" >&2
  exit 2
fi

load_supabase_env() {
  local key value

  [[ -f "${env_file}" ]] || return 0

  while IFS='=' read -r key value; do
    key="${key%$'\r'}"
    value="${value:-}"
    value="${value%$'\r'}"

    case "${key}" in
      SUPABASE_PROJECT_REF|SUPABASE_ACCESS_TOKEN|SUPABASE_URL|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ARTICLES_TABLE)
        if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
          value="${value:1:${#value}-2}"
        elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
          value="${value:1:${#value}-2}"
        fi
        export "${key}=${value}"
        ;;
    esac
  done < "${env_file}"
}

require_value() {
  local variable_name="$1"
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Missing ${variable_name}. Add it to ${env_file}." >&2
    exit 1
  fi
}

find_python() {
  if [[ -x "${project_dir}/.venv/Scripts/python.exe" ]]; then
    printf '%s' "${project_dir}/.venv/Scripts/python.exe"
  elif [[ -x "${project_dir}/.venv/bin/python" ]]; then
    printf '%s' "${project_dir}/.venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    command -v python3
  elif command -v python >/dev/null 2>&1; then
    command -v python
  else
    echo "Python is required to prepare the API request and seed articles." >&2
    exit 1
  fi
}

load_supabase_env
require_value SUPABASE_PROJECT_REF
require_value SUPABASE_ACCESS_TOKEN

if [[ ! -f "${schema_file}" ]]; then
  echo "Schema file not found: ${schema_file}" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to call the Supabase Management API." >&2
  exit 1
fi

python_bin="$(find_python)"
payload_file="$(mktemp)"
response_file="$(mktemp)"

cleanup() {
  rm -f -- "${payload_file}" "${response_file}"
}
trap cleanup EXIT

"${python_bin}" - "${schema_file}" "${payload_file}" <<'PY'
import json
import sys
from pathlib import Path

schema_path = Path(sys.argv[1])
payload_path = Path(sys.argv[2])
payload_path.write_text(
    json.dumps({"query": schema_path.read_text(encoding="utf-8"), "read_only": False}),
    encoding="utf-8",
)
PY

echo "Applying the articles schema to Supabase project ${SUPABASE_PROJECT_REF}..."
http_status="$(
  curl \
    --silent \
    --show-error \
    --output "${response_file}" \
    --write-out '%{http_code}' \
    --request POST \
    "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
    --header "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    --header "Content-Type: application/json" \
    --data-binary "@${payload_file}"
)"

if [[ ! "${http_status}" =~ ^2 ]]; then
  echo "Supabase rejected the schema request with HTTP ${http_status}." >&2
  sed -n '1,120p' "${response_file}" >&2
  exit 1
fi

echo "Supabase articles table is ready."

if [[ "${seed_articles}" == true ]]; then
  require_value SUPABASE_URL
  if [[ -z "${SUPABASE_SECRET_KEY:-}" && -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    echo "Missing SUPABASE_SECRET_KEY. Add the server secret to ${env_file} to seed articles." >&2
    exit 1
  fi

  echo "Importing the starter journal articles..."
  cd -- "${project_dir}"
  "${python_bin}" -m backend.seed_supabase
fi

echo "Supabase setup is complete. Restart FastAPI to use the remote article store."
