#!/usr/bin/env bash

declare cmd=$*

declare FiberyAPIkey='e3f705b1.5d343402dae27d46f53965264d009909ce6'
declare fiberyUrl=https://jrp-zoho.fibery.io/api/commands

declare space=REPORTS
declare queryFrom="$space/Call Stats"

cmd=${cmd//\\/\\\\}     # Escape backslashes
cmd=${cmd//\"/\\\"}     # Escape dquotes
date=$(date)
cmd='[{"command": "fibery.entity/query", "args": {
    "query": {
        "q/from": "'$queryFrom'",
        "q/select": [
            { "'$queryFrom' record count": [ "q/count", ["'$space/Name'", "fibery/id"] ] }
        ]
    }
}}]'

if result=$( curl --silent -X POST "$fiberyUrl" -H "Authorization: Token $FiberyAPIkey" -H 'Content-Type: application/json' -d "$cmd"
    ) && [[ $result =~ '{"success":true' ]]; then
    echo "SUCCESS - $date"
    echo "$result" | sed 's/.*"message":"//; s/\\n/\n/g; s/\\t/\t/g'
else
    echo -n "FAILED - $date : "
    echo "$result" | sed 's/.*"message":"//; s/\\n/\n/g; s/\\t/\t/g; s/","data":{/\n/'
fi
