#!/usr/bin/env bash
declare SPACE=${1:-$SPACE}; shift       # If $1 is supplied, it must be the SPACE
declare QUERY=${1:-$QUERY}              # If the QUERY is supplied, it must be $2
: ${SPACE:?'Please define SPACE var (or pass Space as first arg)'}
: ${QUERY:?'Please define QUERY var (or pass Query as second arg)'}

declare FiberyAPIkey='e3f705b1.5d343402dae27d46f53965264d009909ce6'
declare fiberyUrl=https://jrp-zoho.fibery.io/api/graphql/space/$SPACE
declare status_re='\{"job":\{"status":"([^"]*)"'  rows_re='([0-9]+) row\(s\) processed"'  jobId_re='\{"jobId":"([^"]+)"'
declare jobId rc result rows status

escape() { perl -e '$_=do{local $/; <STDIN>}; s/\t/\\t/g; s/"/\\"/g; s/\n/\\n/g; print'; }

do_graphQL() {
    local   query=$( echo "$1" | sed -E '/^\s*#/ d; s/\s+#.*//; s/^\s*//; s/\s+$//; s/\s+/ /g;' | tr '\n' ' ' | escape )
    local   data='{"query": "'$query'"}'
    result=$( curl --silent -X POST "$fiberyUrl" -H "Authorization: Token $FiberyAPIkey" -H 'Content-Type: application/json' -d "$data" )
    rc=$?;  jobId='';  status='';  rows=''
    ((rc!=0)) && return 2           # curl error
    [[ $result =~ $jobId_re  ]] &&  jobId=${BASH_REMATCH[1]}
    [[ $result =~ $status_re ]] && status=${BASH_REMATCH[1]}
    [[ $result =~ $rows_re   ]] &&   rows=${BASH_REMATCH[1]}
    if [[ $result =~ 'The upstream server is timing out' ]]; then
        rc=3
    elif [[ $result =~ '"data":{"job":null}' ]]; then
        rc=4
    elif [[ $result =~ 'Cannot delete not found entities' ]]; then
        rc=5
    elif [[ $status = FAILED ]]; then
        rc=9
    elif [[ $status = COMPLETED ]]; then
        rc=0
    elif [[ $status = EXECUTING ]]; then
        [[ $result =~ 'Completed successfully"' ]] && rc=0 || rc=255
    elif [[ $jobId ]]; then
        rc=254          # Job is running
    else
        : ${Unknown_condition:?$result}
    fi
}

echo_result() {
    echo -ne "$(date) \trc=$rc \t"
    sed -E 's#\\([/"\\])#\1#g' <<<"$result"
}

# echo "QUERY: $QUERY"
do_graphQL "$QUERY"
echo_result
((rc<250)) && exit $rc

# Keep checking job until completed
checkJobQuery="{job(id:\"$jobId\"){status message actions {actionName result {message}}}}"
while :; do
    do_graphQL "$checkJobQuery"
    echo_result
    ((rc<250)) && exit $rc
    sleep 29
done 

# Show last log entry:  tac .graphql.sh.log | sed -rn '1,/^202[3456789]-[01][0-9]-[0-3][0-9]/ p' | tac