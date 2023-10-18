#!/usr/bin/env bash
declare -a args=( 'https://jrp.fibery.io/api/automations/auto-rules/652eb97b77e378aa89aecbfb'
  -X 'PUT'
#   -H 'authority: jrp.fibery.io'
#   -H 'accept: application/json'
#   -H 'accept-language: en-US,en;q=0.9'
  -H 'content-type: application/json; charset=utf-8'
#   -H 'cookie: _ga=GA1.2.1853867331.1668467195; intercom-device-id-ejb71ydt=f4a12149-1b80-4697-aa24-82c77353e47a; site.sid=s%3AsegBmYeworlOYW_tL_E5MHL6A5yU2Ks5.ZwtVC8hInvoICYcWjM%2B%2FuEECRf05mF407RF%2BxccVWI4; intercom-session-ejb71ydt=a1JwOU15d2tTWE1hR3c3ZkptMDhmL21hV2lqN1grdU1HYnJJZ1lzbjZwYVJjQU5CaWdlYm4wcElyVVdaaXFxSC0tM0tuQzNsTnlqZnJUOEFuNGhzT2kyUT09--5607c02842dcd33818c5a9ade96e206fffec9ced'
   -H 'cookie: site.sid=s%3AsegBmYeworlOYW_tL_E5MHL6A5yU2Ks5.ZwtVC8hInvoICYcWjM%2B%2FuEECRf05mF407RF%2BxccVWI4'
#   -H 'dnt: 1'
#   -H 'origin: https://jrp.fibery.io'
#   -H 'referer: https://jrp.fibery.io/fibery/space/Projects/database/Task/automations/rule/652eb97b77e378aa89aecbfb/actions'
#   -H 'sec-ch-ua: "Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"'
#   -H 'sec-ch-ua-mobile: ?0'
#   -H 'sec-ch-ua-platform: "Windows"'
#   -H 'sec-fetch-dest: empty'
#   -H 'sec-fetch-mode: cors'
#   -H 'sec-fetch-site: same-origin'
#   -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
  --data-raw '{"name":"TEST RULE 1 y","triggers":[{"trigger":"time-based","args":{"schedulerConfig":{"freq":3,"interval":1,"dtstart":"2023-10-17T17:42:17.464Z","byhour":16,"byminute":0},"filter":{"filterExpression":[">",{"q/from":["6a5e93a8-43b6-4eac-b2d0-4558b20dea79"],"q/select":["q/count",["71fe9ae6-bde0-4bb1-ab5b-7801a54182d1"]],"q/where":["=",["71fe9ae6-bde0-4bb1-ab5b-7801a54182d1"],"$where1"],"q/limit":"q/no-limit"},"$where2"],"params":{"$where1":"f13af52d-dea3-40af-83dc-b41876015c00","$where2":0}}}}],"actions":[{"id":"6abf5f46-2d59-4904-9d19-4974cde02742","action":"script-138ad153-99a9-4048-bce3-a0eb421d3866","args":{"script":{"type":"value","value":"// script 1"}}},{"id":"7a30a505-ae25-4c8a-9715-61c333d054fe","action":"update-138ad153-99a9-4048-bce3-a0eb421d3866","args":{"fields":{"type":"value","value":{"6a5e93a8-43b6-4eac-b2d0-4558b20dea79":{"type":"value","value":[{"fibery/id":"f13af52d-dea3-40af-83dc-b41876015c00"}]}}}}},{"id":"6e35fcd3-177c-4805-8a1d-e2937b1edf25","action":"script-138ad153-99a9-4048-bce3-a0eb421d3866","args":{"script":{"type":"value","value":"// script y"}}}]}' \
  --compressed
)

curl "${args[@]}"