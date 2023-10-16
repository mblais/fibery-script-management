#!/usr/bin/env bash
limit=${limit?"'limit' env var must be defined"}
condition=${condition?"'condition' env var must be defined"}        # creationDate:{ greaterOrEquals: "2023-09-27"}
DB=${DB?"'DB' env var must be defined"}                             # dealStats

declare FiberyAPIkey='e3f705b1.5d343402dae27d46f53965264d009909ce6'
declare fiberyUrl=https://jrp-zoho.fibery.io/api/graphql/space/REPORTS

declare now=$(TZ=America/Los_Angeles date --iso-8601=seconds)
declare log=$(realpath "$(dirname "$0")/.$(basename "$0").log")
# which jq &>/dev/null || jq() { /home/customer/.local/bin/jq "$@"; }
escape() { perl -e '$_=do{local $/; <STDIN>}; s/\t/\\t/g; s/"/\\"/g; s/\n/\\n/g; print' <<< "$*"; }
exec 3>&1       # Save originial stdout in &3
exec 2>&1
{
    # The query:
    query=${query:-"mutation{ ${DB} (${condition} limit: ${limit}) {delete{message}}}"}
    query=$( escape "$query" )
    data='{"query": "'$query'"}'
    # echo "QUERY:  $data" >&2 # ; exit 0
    declare rc deleted started=`date +%s`
    declare result=$( curl --silent -X POST "$fiberyUrl" -H "Authorization: Token $FiberyAPIkey" -H 'Content-Type: application/json' -d "$data" )
    declare rc=$?
    declare elapsed=$(( `date +%s` - started ))
    if [[ $result =~ '{"dealStats":{"delete":null}' ]]; then
        rc=3        # all done
        deleted=0
    elif [[ $result =~ 'The upstream server is timing out' ]] || [[ $result =~ 'Cannot delete not found entities' ]]; then
        rc=2
    else
        declare re='"message":"Delete: ([0-9]+)[^"]+deleted'
        [[ $result =~ $re ]] && deleted=${BASH_REMATCH[1]}
    fi
    echo
    declare -p now query result elapsed deleted rc
    exit $rc
} | tee -a "$log"
# Show last log entry:  tac .graphql.sh.log | sed -rn '1,/^202[3456789]-[01][0-9]-[0-3][0-9]/ p' | tac
