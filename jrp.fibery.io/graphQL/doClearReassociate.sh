#!/usr/bin/env bash
# declare -x DB=${DB:-callStats}
declare L0=${1:-3000}
export L=$L0  DB=${DB?'DB should be defined (callStats or dealStats'}
# which jq &>/dev/null || jq() { /home/customer/.local/bin/jq "$@"; }
declare seq
for seq in {0..23}; do
    sleep 2
    echo -e "\nseq: $seq    LIMIT: $L"
    export limit=$L condition="reassociate:{is:true} sequence:{is:$seq}"
    eval "`./clearReassociate.sh`" || exit
    # jq<<<"$result"
    echo "$result"
    echo "($rc) ELAPSED: $elapsed"
    # if ((rc==3 || deleted<1)); then
    #     echo "NO records deleted - DONE"
    #     exit
    # elif ((rc==0)); then
    #     ((elapsed<45)) && L=$((L*6/5))
    # else
    #     L=$((L*3/5))
    #     ((L<20)) && L=20
    #     sleep 52
    # fi
done 
