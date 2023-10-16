#!/usr/bin/env bash
# Check the status of an "executeAsBackgroundJob" graphQL job
export jobId=${1:-$jobId}
export jobId=${jobId:?"Please pass or set 'jobId'"}

declare FiberyAPIkey='e3f705b1.5d343402dae27d46f53965264d009909ce6'
declare fiberyUrl=https://jrp-zoho.fibery.io/api/graphql/space/REPORTS

declare now=$(TZ=America/Los_Angeles date --iso-8601=seconds)
declare log=$(realpath "$(dirname "$0")/.$(basename "$0").log")
escape() { perl -e '$_=do{local $/; <STDIN>}; s/\t/\\t/g; s/"/\\"/g; s/\n/\\n/g; print' <<< "$*"; }

# The query:
query="{job(id:\"$jobId\"){status message actions {actionName result {message}}}}"
query=$( escape "$query" )
data='{"query": "'$query'"}'
# echo "QUERY:  $data" >&2 ; exit 0

exec 2>&1
{
    declare result=$( curl --silent -X POST "$fiberyUrl" -H "Authorization: Token $FiberyAPIkey" -H 'Content-Type: application/json' -d "$data" )
    declare rc=$?
    declare status      status_re='\{"job":\{"status":"([^"]*)"'
    [[ $result =~ $status_re ]] && status=${BASH_REMATCH[1]}
    declare rows        rows_re='([0-9]+) row\(s\) processed"'
    [[ $result =~ $rows_re ]] && rows=${BASH_REMATCH[1]}

    if ((rc!=0)); then
        rc=2                    # curl error
    elif [[ $result =~ 'The upstream server is timing out' ]]; then  # || [[ $result =~ 'Cannot delete not found entities' ]]; then
        rc=3
    elif [[ $result =~ '"data":{"job":null}' ]]; then
        rc=4
    elif [[ $status = FAILED ]]; then
        rc=5
    elif [[ $status = COMPLETED ]]; then
        rc=-1
    elif [[ $status = EXECUTING ]]; then
        rc=0
    fi

    # Send result-vars declarations to &9
    \ls /proc/$$/fd/9 &>/dev/null  &&  declare -p now query result rc rows status >&9   # | sed 's/\\"/"/g; s/\\\\/\\/g'
    exit $rc
} | tee -a "$log"

# Show last log entry:  tac .graphql.sh.log | sed -rn '1,/^202[3456789]-[01][0-9]-[0-3][0-9]/ p' | tac
