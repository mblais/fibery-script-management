#!/usr/bin/env bash
# Fibery Automation management
# shellcheck disable=SC2206,SC2128,SC2086,SC2048,SC2207,SC2162,SC1007,SC2181,SC2229

#   [ AUTOMATION_ID=... ]  automations.sh  [ --id {AUTOMATION_ID} ]  {command}
#
#   commands:  --enable  --disable      -- enable or disable the automation
#   params:    --index=n

declare action=${1:?'Please supply the action as the first arg'}
declare AUTOMATION_ID=${2:-AUTOMATION_ID}
: ${AUTOMATION_ID:?'Please supply the AUTOMATION_ID in env-var or arg 2'}

declare FIBERY_DOMAIN=jrp.fibery.io
source "${?:FIBERY}/fiberyConfig.sh"
# sed -E '/^\s*#/ d; s/\s+#.*//; s/^\s*//; s/\s+$//; s/\s+/ /g;' | tr '\n' ' ' | escape

# Enable/disable a Button:
source ../fiberyConfig.sh
declare automationId=62a7687876e2fff160b5b7e5     # "name": "⚡Bulk Edit Tasks"
declare enable=false   # true/false
declare -a args=(
    "https://${FIBERY_DOMAIN:?}/api/automations/buttons/${automationId:?}"
    -X 'PUT'
    -H "Authorization: Token ${FIBERY_API_KEY}"
    -H 'content-type: application/json; charset=utf-8'
    --compressed --data-raw "{\"enabled\":$enable}"
)
curl --silent "${args[@]}"


# Get all Button definitions for a Type
declare typeId='138ad153-99a9-4048-bce3-a0eb421d3866'
declare -a args=(
    "https://${FIBERY_DOMAIN:?}/api/automations/buttons/for-type/${typeId:?}"
    -H "Authorization: Token ${FIBERY_API_KEY:?}"
    -H 'content-type: application/json; charset=utf-8'
)
curl --silent "${args[@]}"


# Get all Automation Rules definitions for a Type
declare typeId='138ad153-99a9-4048-bce3-a0eb421d3866'
declare -a args=(
    "https://${FIBERY_DOMAIN:?}/api/automations/auto-rules/for-type/${typeId:?}"
    -H "Authorization: Token ${FIBERY_API_KEY:?}"
    -H 'content-type: application/json; charset=utf-8'
)
curl --silent "${args[@]}"


# Update an Automation:
declare ruleId='652eb97b77e378aa89aecbfb'
declare -a args=(
    "https://${FIBERY_DOMAIN}/api/automations/auto-rules/${ruleId:?}"  # TEST RULE 1
    -X 'PUT'
    -H "Authorization: Token ${FIBERY_API_KEY:?}"
    -H 'content-type: application/json; charset=utf-8' 
    --compressed
    --data-raw $'{"name":"TEST RULE 1 a","triggers":[{"trigger":"time-based","args":{"schedulerConfig":{"freq":3,"interval":1,"dtstart":"2023-10-17T17:42:17.464Z","byhour":16,"byminute":0},"filter":{"filterExpression":[">",{"q/from":["6a5e93a8-43b6-4eac-b2d0-4558b20dea79"],"q/select":["q/count",["71fe9ae6-bde0-4bb1-ab5b-7801a54182d1"]],"q/where":["=",["71fe9ae6-bde0-4bb1-ab5b-7801a54182d1"],"$where1"],"q/limit":"q/no-limit"},"$where2"],"params":{"$where1":"f13af52d-dea3-40af-83dc-b41876015c00","$where2":0}}}}],"actions":[{"id":"6abf5f46-2d59-4904-9d19-4974cde02742","action":"script-138ad153-99a9-4048-bce3-a0eb421d3866","args":{"script":{"type":"value","value":"// script 1z"}}},{"id":"7a30a505-ae25-4c8a-9715-61c333d054fe","action":"update-138ad153-99a9-4048-bce3-a0eb421d3866","args":{"fields":{"type":"value","value":{"6a5e93a8-43b6-4eac-b2d0-4558b20dea79":{"type":"value","value":[{"fibery/id":"f13af52d-dea3-40af-83dc-b41876015c00"}]}}}}},{"id":"6e35fcd3-177c-4805-8a1d-e2937b1edf25","action":"script-138ad153-99a9-4048-bce3-a0eb421d3866","args":{"script":{"type":"value","value":"// script 1a"}}}]}'
)
curl --silent "${args[@]}"
