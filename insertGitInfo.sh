#!/usr/bin/env bash
# Insert the "git log" info for a tracked file into the file as a js comment block.
# The pre-existing comment block (required) is replaced with the current "git log" info for the file.
# $1 = the file; subsequent script params are passed to sed (e.g. "-i")
declare fname=${1:?'Supply filename as param 1'}; shift
declare sedArgs=("$@")
declare fullpath=$( realpath "$fname" )
declare git_cmd="git log --decorate -n1"
declare git_output=$( $git_cmd "$fullpath" )
declare git_commented=$(
    echo "/* ${git_cmd} \"${fullpath}\"\\"
    sed -E 's#^#** #; s/$/\\/' <<<"$git_output"
    echo '*/'
)
# echo "$git_commented"; exit

# Process the file, replacing the existing "git log" comment block with the new one.
sed "${sedArgs[@]}" '\#^/\* git log#i\
'"${git_commented}"'
\#^/\* git log#,\#^\*/$#d' "$fname"