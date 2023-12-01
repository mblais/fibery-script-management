# fibscripts - Manage Fibery automation scripts locally

## OVERVIEW

This is a Node.js app that uses UNDOCUMENTED Fibery.io API calls to get and update automation scripts (Javascript) in your Fibery.io Button and Rule automations. This allows you to write and manage your Fibery scripts locally with familiar tools (including source control).

## COMMANDS

Usage:  fibscripts  { pull | push | purge | orphans | help {cmd} }  [ options... ]

    help [cmd]            Show help, optionally for a specific program command
    pull                  Download and save Fibery workspace Button and Rule Javascript actions
    push                  Push local Javascript Button and Rule actions back to Fibery workspace
    purge --before {date} Delete cache entries older than the specified cutoff date
    orphans               List orphaned local files and dirs that were deleted in Fibery

## OPTIONS (can appear anywhere on the command line)

    --workspace   -w      The Fibery workspace domain, e.g. "my.fibery.io" - or, the full path to the local workspace dir
    --space       -s      Space   name filter
    --db          -d      DB      name filter
    --button      -b      Button  name filter
    --rule        -r      Rule    name filter
    --cache       -c      Use existing cached Space/DB info instead getting it from Fibery
    --nogit       -g      Don't try to use git (when your local script files are not tracked in git)
    --nofiles             Ignore local script files; use with `push` to restore automations from cache files
    --yes         -y      Create/rename local files/directories as needed for pull operations
    --fake        -f      Dry run - don't actually update or overwrite anything
    --verbose     -v      Verbose output
    --debug       -u      Debug output
    --quiet       -q      Disable progress messages and spinners; only output a terse summary
    --before {date-time}  End of range for cache files (matches before OR EQUAL)
    --after  {date-time}  Start of range for cache files

## REQUIRED ENVIRONMENT VARIABLES

    FIBERY                Base path for all local storage managed by the app
    FIBERY_DOMAIN         Which Fibery workspace domain to manage (or specify this with the `--workspace` option)
    FIBERY_API_KEY        API key for your FIBERY_DOMAIN - get it from "Fibery Settings > API Keys"

## BASIC OPERATION

Your Fibery workspace domain (e.g. "my.fibery.io") is specified by the FIBERY_DOMAIN env var or the `--workspace` option. It also specifies the directory name under which the hierarchy of Fibery scripts for the workspace is stored.

If FIBERY_DOMAIN is just the domain name without a path (e.g. "my.fibery.io") then the FIBERY env var specifies the parent directory (e.g. "/home/me/fibery/") under which specific workspace directoryies will be stored.

Alternatively, FIBERY_DOMAIN can specify the full path to the workspace directory (e.g. "/home/me/fibery/my.fibery.io/"), in which case the FIBERY env var is ignored.

Use `fibscripts pull` to pull automation scripts from a Fibery workspace and store them in local *.js files under a directory hierarchy that mirrors the workspace's Spaces and DBs.

Use `fibscripts push` to push local *.js script files back to the Fibery workspace. Comments are inserted at the top of each script for identification and git info.

The options `--space` `--db` `--button` and `--rule` define name filters to determine which Fibery elements will be processed by a command.

## FILTERS

Filters are used to define the scope of a program operation by defining which Spaces/DBs/Buttons/Rules will be affected.

Filters are glob-like by default, or regex if preceded by '/' (trailing slash is not required). Any filter is negated if the first character is '!'. Filters are always case-insensitive.

If no filter is specified for a Space/DB, ALL Spaces/DBs will be processed.

If no filter is specified for a Button/Rule, NONE will be processed. So you must specify either the `--button` or `--rule` filter (or both) in order for any automations to be processed.

Maximum of one filter can be defined per category (Space/DB/Button/Rule). All supplied filters must match an item for it to be processed.

## DIRECTORY STRUCTURE

fibscripts stores the scripts and API results data pulled from a Fibery Workspace in a hierarchy of local folders. These directories are automatically created as needed if the `--yes` option is specified. If `--yes` is not specified an error is generated for a missing local directory.

The base directory containing all Fibery workspaces is defined by the FIBERY or FIBERY_DOMAIN env var. The directory structure mostly mirrors the URL structure of automations, e.g.:

    my.fibery.io/fibery/space/{SpaceName}/database/{DBName}/automations/{button or rule}/{automation name}

The only difference between the Fibery URLs and corresponding local directory paths is that *automation names* are used in the local paths instead of the IDs used in URLs.

E.g., the URL:  "https://my.fibery.io/fibery/space/Projects/database/Tasks/automations/button/64ac4ff5ff58afe1abad6537/actions"
would correspond to the local path :  "my.fibery.io/fibery/space/Projects/database/Tasks/automations/button/My Button Name ~{id}.js"

Your Fibery workspace must be specified via the FIBERY_DOMAIN env var or the `--workspace` option; e.g. `--workspace=my.fibery.io`.

Each script action in a Button/Rule automation will be stored in its respective directory as described above, named either `{Button-name} ~{id}.js` or `{Rule-name} ~{id}.js`. The '{id}' within the name is the last four characters of the script's Action ID and is used to correlate each script file to a particular action within its automation (because there could be more than one script-action within a Button/Rule automation).

The program will detect when a Space/DB/Automation has been renamed in Fibery, and if the `--yes` program option was specified the program will try to rename the corresponding local file/directory to match the new Fibery name using `git mv` (unless `--nogit` is specified, in which case the directory is renamed with the default OS rename functions).

Some cache directories and housekeeping files are also created throughout the file hierarchy; their names always begin with a period.

## CACHING

The result of every Fibery API call that returns part of the Workspace is stored in a local cache file or directory beginning with a period. These cached API results can be reused by the program instead of re-querying the Fibery API by specifying the `--cache` option. This can save time especially if you have many Spaces and DBs and automations to process.

These cache files also serve as backups, since they contain the complete definitions of all automations pulled from Fibery (not just the actual scripts).

Old cache files are not automatically deleted; Use the `purge` program command to trim them.

When the `--cache` option is specified without any dates, the most recent cache files will be used. If you want the program to use different (earlier) cache files, specify a date range with the `--before` and `--after` options. A cache file's filename encodes its creation date+time, and this is used to find the most recent cache files within the date range specified by `--before` and `--after`. When a date range is specified, the program will always use the most recent cache files found within that range.

## SCRIPT MACROS

The program includes a simple macro feature to allow local script files to "include" other local files (think the C preprocessor). Macros are processed recursively, so they can include other macros.

Within a script file, including another source file is accomplished by specifying its path in a single-line comment of the form:

    //+include <path>

This directs the program to insert the file specified by `<path>` before the next line. Macro comments must start at the beginning of a line with no preceding whitespace.
    
If the `<path>` begins with the "@" symbol, the "@" is replaced with the current FIBERY_DOMAIN directory path.

A relative path is interpreted as relative to the directory of the file currently being processed; that could be a macro file in the case of one macro file including another.

Immediately after the inserted macro content the program will add a corresponding macro-end comment line of the form:

    //-include <path>

When adding a macro-inclusion comment in a script file, you do not need to incude the corresponding macro-end comment line; the program will insert it.

When a local script file is `pushed` to Fibery, each macro block within a source file (i.e. the lines between `//+include` and `//-include`, if present) is replaced with the current content of the referenced macro file.

When pulling script files from Fibery, any macro content and comments will be left untouched, so after a `pull` operation your local script files will reflect what is actually on the server. But each time a local script file gets `pushed` back to your Fibery workspace, all its macro blocks will first be replaced by the current macro files' content.

## PROGRAM COMMANDS IN DETAIL

### fibscripts pull

Download and save Fibery workspace Button and Rule Javascript actions. This will OVERWRITE existing local script files, so you make sure you've committed any local changes before doing a pull.

Use the filter options to limit what Spaces/DBs/Buttons/Rules will be retrieved:

    --space       -s    Space   name filter
    --db          -d    DB      name filter
    --button      -b    Button  name filter
    --rule        -r    Rule    name filter

### fibscripts push

Push local Javascript Button and Rule actions back to Fibery workspace. This will OVERWRITE Fibery script actions, so make sure the curent Workspace scripts are backed up. A `pull --fake` command (without `--cache`) will download the current Workspace scripts to local cache; `--fake` prevents overwriting your lcoal script files.

If the `--nofiles` option is specified, local Button and Rule script source files will be ignored, and their cached definitions will be pushed instead. In this case not only the actions will be pushed but also the complete cached automation definitions. This allows restoring complete Button/Rule definitions from old cached versions.

Use the filter options to limit what Spaces/DBs/Buttons/Rules will be updated:

    --space       -s    Space   name filter
    --db          -d    DB      name filter
    --button      -b    Button  name filter
    --rule        -r    Rule    name filter

### fibscripts purge --before {date-time}

Purge local cache entries that were created on or before the specified cutoff date-time.

Older cache files are not automatically deleted. Use `purge` with `--before` to trim them.

Use the filter options to limit what Spaces/DBs/Buttons/Rules will be affected:

    --space       -s    Space   name filter
    --db          -d    DB      name filter

### fibscripts orphans

Search for "orphaned" local files and dirs that no longer correspond to the Fibery Workspace.

You can use these filter options to limit which local Space/DB dirs will be checked:

    --space       -s    Space   name filter
    --db          -d    DB      name filter
    --button      -b    Button  name filter
    --rule        -r    Rule    name filter

## EXAMPLES

    fibscripts  pull -b/ -r/                             # Pull ALL local Button and Rule scripts from Fibery, overwriting local script files
    fibscripts  push -r/ -b/                             # Push ALL local Button and Rule scripts to Fibery, overwriting current Workspace scripts
    fibscripts  pull --space=test\* -b/                  # Pull Button scripts only from Spaces beginning with "test"
    fibscripts  pull --space='!/^test|^foo' -r/          # Pull Rule scripts only from Fibery Spaces NOT beginning with "test" or "foo"
    fibscripts  pull --rule='/test|foo'                  # Pull Rule scripts from all Rules with names containing "test" or "foo"
    fibscripts  push --space='test*' -b/                 # Push all Button scripts in Spaces beginning with "test"
    fibscripts  push --db=bar -b'/test|foo'              # Push Button scripts for Buttons containing "test" or "Foo" in the Bar DB of any Space
    fibscripts  push --nofiles --before 2023-01-30 -b/   # Push cached Button definitions from latest cache files ≤ 2023-01-30
    fibscripts  purge --before 2023-01-30                # Delete local cache files created ≤ 2023-01-30
    fibscripts  orphans                                  # Find all "orphaned" local files and dirs that no longer correspond to the Fibery Workspace
    fibscripts  help pull                                # Show help for the `pull` command