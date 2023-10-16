#!/usr/bin/env bash
condition=${condition?"'condition' env var must be defined"}        # creationDate:{ greaterOrEquals: "2023-09-27"}
declare L0=${1:-100}
declare -x L=$L0 DB=dealStats
which jq &>/dev/null || jq() { /home/customer/.local/bin/jq "$@"; }
while :; do
    echo -e "\nLIMIT: $L"
    sleep 2
    # export limit=$L condition=$condition
    eval "`./deleteStats.sh`"
    jq<<<"$result"
    echo "($rc) ELAPSED: $elapsed"
    if ((rc==3 || deleted<1)); then
        echo "NO records deleted - DONE"
        exit
    elif ((rc==0)); then
        ((elapsed<45)) && L=$((L*6/5))
    else
        L=$((L*3/5))
        ((L<20)) && L=20
        sleep 52
    fi
done 
