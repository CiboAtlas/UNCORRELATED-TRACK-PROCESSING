#!/bin/bash
set -e

BASE_DIR="examples/symbolic_regression/problems"
DOMAINS=("bio_pop_growth" "chem_react" "matsci" "phys_osc")

echo "{"
echo '  "OpenEvolve_Run": {'
echo '    "start_time": "'"$(date '+%Y-%m-%d %H:%M:%S')"'",'
echo '    "domains": ['

first_domain=true

for domain in "${DOMAINS[@]}"; do
  DOMAIN_PATH="$BASE_DIR/$domain"
  if [ ! -d "$DOMAIN_PATH" ]; then
    continue
  fi

  if [ "$first_domain" = false ]; then
    echo "      ,"
  fi
  first_domain=false

  echo '      {'
  echo '        "domain": "'"$domain"'",'
  echo '        "problems": ['

  first_problem=true
  for problem_dir in "$DOMAIN_PATH"/*; do
    [ -d "$problem_dir" ] || continue

    PROBLEM_NAME=$(basename "$problem_dir")
    LOG_PATH="$problem_dir/openevolve_output/logs/openevolve_$(date '+%Y%m%d').log"

    # Parse metrics from best_program_info.json if it exists
    INFO_JSON="$problem_dir/openevolve_output/best/best_program_info.json"
    if [ -f "$INFO_JSON" ]; then
      SCORE=$(jq -r '.combined_score // "null"' "$INFO_JSON" 2>/dev/null)
      MSE=$(jq -r '.negative_mse // "null"' "$INFO_JSON" 2>/dev/null)
      COMPLEXITY=$(jq -r '.complexity // "null"' "$INFO_JSON" 2>/dev/null)
      DIVERSITY=$(jq -r '.diversity // "null"' "$INFO_JSON" 2>/dev/null)
      BEST_UUID=$(jq -r '.best_uuid // "null"' "$INFO_JSON" 2>/dev/null)
      ISLANDS=$(jq -r '.islands // "null"' "$INFO_JSON" 2>/dev/null)
      WORKERS=$(jq -r '.workers // "null"' "$INFO_JSON" 2>/dev/null)
    else
      SCORE=null; MSE=null; COMPLEXITY=null; DIVERSITY=null
      BEST_UUID=null; ISLANDS=null; WORKERS=null
    fi

    if [ "$first_problem" = false ]; then
      echo "          ,"
    fi
    first_problem=false

    echo '          {'
    echo '            "problem": "'"$PROBLEM_NAME"'",'
    echo '            "metrics": {'
    echo '              "combined_score": '"${SCORE:-null}"','
    echo '              "negative_mse": '"${MSE:-null}"','
    echo '              "complexity": '"${COMPLEXITY:-null}"','
    echo '              "diversity": '"${DIVERSITY:-null}"','
    echo '              "best_uuid": "'"${BEST_UUID:-null}"'",'
    echo '              "islands": "'"${ISLANDS:-null}"'",'
    echo '              "workers": "'"${WORKERS:-null}"'"'
    echo '            },'
    echo '            "log_path": "'"$LOG_PATH"'"'
    echo '          }'
  done
  echo "        ]"
  echo "      }"
done

echo "    ]"
echo '  }'
echo "}"
