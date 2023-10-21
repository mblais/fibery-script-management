#!/usr/bin/env bash

declare -a args=( 'https://jrp.fibery.io/api/automations/auto-rules/652eb97b77e378aa89aecbfb'
    -X 'PUT'
    -H "Authorization: Token ${FIBERY_API_KEY}"
    -H 'content-type: application/json; charset=utf-8'
    --compressed --data-raw # '{"name":"TEST RULE 1 y","triggers":[{"trigger":"time-based","args":{"schedulerConfig":{"freq":3,"interval":1,"dtstart":"2023-10-17T17:42:17.464Z","byhour":16,"byminute":0},"filter":{"filterExpression":[">",{"q/from":["6a5e93a8-43b6-4eac-b2d0-4558b20dea79"],"q/select":["q/count",["71fe9ae6-bde0-4bb1-ab5b-7801a54182d1"]],"q/where":["=",["71fe9ae6-bde0-4bb1-ab5b-7801a54182d1"],"$where1"],"q/limit":"q/no-limit"},"$where2"],"params":{"$where1":"f13af52d-dea3-40af-83dc-b41876015c00","$where2":0}}}}],"actions":[{"id":"6abf5f46-2d59-4904-9d19-4974cde02742","action":"script-138ad153-99a9-4048-bce3-a0eb421d3866","args":{"script":{"type":"value","value":"// script 1"}}},{"id":"7a30a505-ae25-4c8a-9715-61c333d054fe","action":"update-138ad153-99a9-4048-bce3-a0eb421d3866","args":{"fields":{"type":"value","value":{"6a5e93a8-43b6-4eac-b2d0-4558b20dea79":{"type":"value","value":[{"fibery/id":"f13af52d-dea3-40af-83dc-b41876015c00"}]}}}}},{"id":"6e35fcd3-177c-4805-8a1d-e2937b1edf25","action":"script-138ad153-99a9-4048-bce3-a0eb421d3866","args":{"script":{"type":"value","value":"// script y"}}}]}' \
)

curl "${args[@]}"