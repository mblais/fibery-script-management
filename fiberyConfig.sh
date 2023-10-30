#!/usr/bin/env bash
# Set (and return) Fibery env vars for a particular Fibery domain (and some misc functions)
# If the first arg is "-0" then output lines will be termianted with \0 instead of \n
# Set the FIBERY_DOMAIN env var, or pass its value as an arg

declare format='%s=%s\n'
[[ $1 = '-0'        ]] && { format='%s=%s\0'; shift; }
[[ $1 = *.fibery.io ]] && { declare -x FIBERY_DOMAIN=$1; shift; }

case $FIBERY_DOMAIN in
    'jrp.fibery.io') 
        declare -x FIBERY_API_KEY='5ca15987.3c0091232ae3a06a509ca0601213f26a844'
        ;;
    'jrp-zoho.fibery.io') 
        declare -x FIBERY_API_KEY='e3f705b1.5d343402dae27d46f53965264d009909ce6'
        ;;
    *)
        echo "${BASH_SOURCE##*/}: FIBERY_DOMAIN is not defined" >&2; return 2
esac

# Misc functions: Escape a graphQL query (JSON) string for curl
escape()   { perl -e '$_=do{local $/; <STDIN>}; s/\t/\\t/g; s/"/\\"/g; s/\n/\\n/g; print'; }
unescape() { sed 's/\\t/\t/g; s/\\"/"/g; s/\\r//g; s/\\n/\n/g; s/\\\\/\\/g'; }

# Echo FIBERY env vars
for var in FIBERY_DOMAIN FIBERY_API_KEY; do
    declare value=${!var}
    printf "$format" "$var" "$value"
done
