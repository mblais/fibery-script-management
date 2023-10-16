#!/usr/bin/env bash
export jobId=${1:-$jobId}
export jobId=${jobId:?"Please pass or set 'jobId'"}
# which jq &>/dev/null || jq() { /home/customer/.local/bin/jq "$@"; }
declare returnVars=`mktemp` || exit

while :; do
    ./checkJobStatus.sh 9>"$returnVars" || exit
    eval "$( cat "$returnVars" )"
    # jq<<<"$result"
    echo -ne "$(date) \trc=$rc \t"
    sed 's/\\"/"/g; s/\\\\/\\/g' <<<"$result"
    ((rc!=0)) && exit $rc
    sleep 59
done 
