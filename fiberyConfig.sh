#!/usr/bin/bash
# Set (and return) Fibery env vars for a particular Fibery domain (and some misc functions)
# If the first arg is "-0" then output lines will be termianted with \0 instead of \n
# Set the FIBERY_DOMAIN env var, or pass its value as an arg

[[ $1 = '-0' ]] && { declare nulls=1; shift; }
declare FIBERY_DOMAIN=${1:-$FIBERY_DOMAIN}

case ${FIBERY_DOMAIN:?} in
    'jrp.fibery.io') 
        declare -x FIBERY_API_KEY='5ca15987.3c0091232ae3a06a509ca0601213f26a844'
        declare -x FIBERY_SITE_SID='s%3AsegBmYeworlOYW_tL_E5MHL6A5yU2Ks5.ZwtVC8hInvoICYcWjM%2B%2FuEECRf05mF407RF%2BxccVWI4'
        ;;
    'jrp-zoho.fibery.io') 
        declare -x FIBERY_API_KEY='e3f705b1.5d343402dae27d46f53965264d009909ce6'
        declare -x FIBERY_SITE_SID=
        ;;
    *)
        echo "${BASH_SOURCE[*]} - unrecognized FIBERY_DOMAIN: $FIBERY_DOMAIN" >&2
        exit 1
esac

# Misc functions:  Escape a graphQL query (JSON) string for curl
escape()   { perl -e '$_=do{local $/; <STDIN>}; s/\t/\\t/g; s/"/\\"/g; s/\n/\\n/g; print'; }
unescape() { sed 's/\\t/\t/g; s/\\"/"/g; s/\\r//g; s/\\n/\n/g; s/\\\\/\\/g'; }

# Echo relevant env vars
for n in FIBERY_DOMAIN FIBERY_API_KEY FIBERY_SITE_SID; do
    [[ $nulls ]] && printf '%s=%s\0' "$n" "${!n}" || echo "$n=${!n}"
done
