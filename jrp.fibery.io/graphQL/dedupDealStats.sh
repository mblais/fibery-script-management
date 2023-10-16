#!/usr/bin/env bash
declare -x limit=${limit:-90}
declare -x DB=dealStats
declare -x condition

declare -a ids=()

consumeId() {
    local id=$1
    [[ $id ]] && ids+=("$id")
    local cnt=${#ids[@]}
    if (( cnt >= limit )) || [[ -z $id ]]; then
        (( cnt > 0 )) || return 2
        condition="id:{ in:[ $( IFS=,; echo "${ids[*]}" ) ]}"
        eval "`./deleteStats.sh`"
        sleep 2
        ids=()
    fi
}

while read id; do
    consumeId "$id"
done
consumeId