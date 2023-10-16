#!/usr/bin/env bash
declare FiberyAPIkey='e3f705b1.5d343402dae27d46f53965264d009909ce6'
declare fiberyUrl=https://jrp-zoho.fibery.io/api/commands

escape() {
    local val=$*
    val=${val//\\/\\\\}     # Escape backslashes
    val=${val//\"/\\\"}     # Escape dquotes
    echo "$val"
}

declare Command=`escape "$1"`
declare  Param1=`escape "$2"`
declare    date=`date --iso-8601=seconds`

declare data='[{ "command": "fibery.entity/create", "args": {
  "type": "MISC/Trigger",
  "entity": {
    "MISC/Name": "'$date'",
    "MISC/Command": "'$Command'",
    "MISC/Param1": "'$Param1'"
  }
}}]'
# echo "$data"; exit

declare result=$( curl --silent -X POST "$fiberyUrl" -H "Authorization: Token $FiberyAPIkey" -H 'Content-Type: application/json' -d "$data" )
declare rc=$?
if ((rc==0)) && [[ $result =~ '{"success":true' ]]; then
    echo "SUCCESS - $date"
else
    echo "FAILED - $date"
fi
sed 's/.*"message":"//; s/\\n/\n/g; s/\\t/\t/g; s/","data":{/\n/' <<<"$result"
exit $rc