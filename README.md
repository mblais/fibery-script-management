# fibscripts - Manage Fibery automation scripts locally

## OVERVIEW

This is a Node.js app that uses UNDOCUMENTED Fibery.io API calls to get and update automation scripts (Javascript) in your Fibery.io Button and Rule automations. This allows you to write and manage your Fibery scripts locally with familiar tools (including source control).

## COMMANDS

    help [cmd]            Show help, optionally for a specific program command
    pull                  Download and save Fibery workspace Button and Rule Javascript actions
    push                  Push local Javascript Button and Rule actions back to Fibery workspace
    purge --before {date} Delete cache entries older than the specified cutoff date
    orphans               List orphaned local files and dirs that were deleted in Fibery
    validate              Check automations for valid structure
    run                   Run an automation script locally (experimental)

## OPTIONS: (can appear anywhere on the command line)

    --workspace          -w   The Fibery workspace domain, e.g. "my.fibery.io" - or, the full path to the local workspace dir
    --space              -s   Space   name filter
    --db                 -d   DB      name filter
    --button             -b   Button  name filter
    --rule               -r   Rule    name filter
    --url                -u   URL of a specific automation to process (use instead of filters)
    --path               -p   Local path to a specific action file to process (use instead of filters)
    --cache              -c   Use existing cached Space/DB info instead getting it from Fibery
    --noclobber          -n   Don't overwrite any existing local scripts (used with pull/push)
    --enable             -e   Use option value of y/n to enable/disable automations
    --nogit              -g   Don't try to use git (when your local script files are not tracked in git)
    --nofiles                 Ignore local script files; use with `push` to restore automations from cache files
    --yes                -y   Create/rename local files/directories as needed for pull operations
    --fake               -f   Dry run - don't actually update or overwrite anything
    --delay              -l   Delay in ms to wait before every Fibery API call
    --nice               -i   Wait for Fibery work queues to clear before running scripts
    --strict-validation  -t   Require all actions to pass validatation
    --quiet              -q   Disable progress messages and spinners; only output a terse summary or count
    --verbose            -v   Verbose output
    --debug                   Debug output
    --before {date-time}      End of date range for cache files (matches before OR EQUAL)
    --after  {date-time}      Start of date range for cache files
    --help                    Show help

## REQUIRED ENVIRONMENT VARIABLES

    FIBERY                Base path for all local storage managed by the app (cache files and automation scripts)
    FIBERY_DOMAIN         Which Fibery workspace domain to manage (or specify this with the `--workspace` option)
    FIBERY_API_KEY        API key for your FIBERY_DOMAIN - get it from "Fibery Settings \> API Keys"

## BASIC OPERATION

Your Fibery workspace domain (e.g. "my.fibery.io") must be specified by the FIBERY_DOMAIN env var or the `--workspace` option. It also specifies the directory name (under $FIBERY) which the hierarchy of Fibery scripts for the workspace is stored.

If FIBERY_DOMAIN is just the bare domain name without any other path components (e.g. just "my.fibery.io") then the FIBERY env var specifies the parent directory (e.g. "/home/me/fibery/") under a specific workspace directory will be stored.

Alternatively, FIBERY_DOMAIN can specify the full path to the workspace directory (e.g. "/home/me/fibery/my.fibery.io/"), in which case the FIBERY env var is ignored.

Use `fibscripts pull` to pull automation scripts from a Fibery workspace and store them in local *.js files under a directory hierarchy that mirrors the workspace's Spaces and DBs.

Use `fibscripts push` to push local *.js script files back to the Fibery workspace. Comments are inserted at the top of each script for identification and git info.

The options `--space` `--db` `--button` and `--rule` define name filters to define and limit which Fibery elements will be processed by a command. These filters operate on Fibery object names, not file names.

The `--url` and `--path` options are an alternative way to specify a single Fibery automation or script, respectively, to be processed by a command.

## FILTERS

Filters are used to define the scope of a program operation by defining which Spaces/DBs/Buttons/Rules will be affected.

Filters are glob-like by default, or regex if preceded by '/' (trailing slash is not required). Any filter is negated if the first character is '!'. Filters are always case-insensitive.

If no filter is specified for a Space/DB, ALL Spaces/DBs will be processed.

If no filter is specified for a Button/Rule, NONE will be processed. So you must specify either the `--button` or `--rule` filter (or both) in order for any automations to be processed.

At most of one filter can be defined per category (Space/DB/Button/Rule). All supplied filters must match an item for it to be processed.

Instead of using the filters to specify an automation for `pull` or `push` or `validate` or `run`, you can use the `--url` or `-path` option to specify the URL or local file path of a single Fibery Button/Rule automation/script to process.

## DIRECTORY STRUCTURE

`fibscripts` stores the scripts and API results data pulled from a Fibery Workspace in a hierarchy of local folders. These directories are automatically created as needed if the `--yes` option is specified. If `--yes` is not specified an error is generated for a missing local directory.

The base directory containing all Fibery workspaces is defined by the FIBERY or FIBERY_DOMAIN env var. The directory structure mostly mirrors the URL structure of automations, e.g.:

    my.fibery.io/fibery/space/{SpaceName}/database/{DBName}/automations/{button or rule}/{automation name}

The only difference between the Fibery URLs and corresponding local directory paths is that *automation names* are used in the local paths instead of the *automation IDs* that are used in Fibery URLs.

E.g., the URL:  "https://my.fibery.io/fibery/space/Projects/database/Tasks/automations/button/64ac4ff5ff58afe1abad6537/actions"
would correspond to the local path:  "my.fibery.io/fibery/space/Projects/database/Tasks/automations/button/My Button Name ~{id}.js"

Your Fibery Workspace must be specified via the FIBERY_DOMAIN env var or the `--workspace` option; e.g. `--workspace=my.fibery.io`.

Each script action in a Button/Rule automation will be stored in its respective directory as described above, named either `{Button-name} ~{id}.js` or `{Rule-name} ~{id}.js`. The '{id}' within the name is the last four characters of the script's Action ID and is used to correlate each script file to a particular action within its automation (because there could be more than one script-action within a Button/Rule automation).

The program will detect when a Space/DB/Automation has been renamed in Fibery, and if the `--yes` program option was specified the program will try to rename the corresponding local file/directory to match the new Fibery name using `git mv` (unless `--nogit` is specified, in which case the directory is renamed with the default OS rename function).

Some cache directories and housekeeping files are also created throughout the file hierarchy; their names always begin with a period.

## CACHING

Every Fibery API query result is stored in a local cache file or directory that begins with a period. These cached API results can be reused by the program instead of re-querying Fibery by specifying the `--cache` option. This can save time if you have many Spaces and DBs and automations.

These cache files also serve as backups, since they contain the *complete definitions of all automations* pulled from Fibery (not just the script actions).

Old cache files are not automatically deleted; Use the `purge` program command to trim them.

When the `--cache` option is specified without any dates, the most recent cache files will be used. If you want the program to use different (earlier) cache files, specify a date range with the `--before` and/or `--after` options. A cache file's filename encodes its creation date+time, and this is used to find the most recent cache files within the date range specified by `--before` and `--after`. When a date range is specified, the program will always use the most recent cache files found within that range.

## SCRIPT MACROS

A simple macro feature allows your local script files to "include" other local source files. Macros are expanded recursively so included files can themselves include additional files.

Within a script file, to include the content of a different source file, specify its path in a single-line comment of the form:

    //+include <path>

This directs the program to insert the file specified by `<path>` before the next line. The comment must start at the beginning of a line (no preceding whitespace).

If the `<path>` begins with the "@" symbol, the "@" is replaced with the current FIBERY_DOMAIN directory path.

A relative path is interpreted relative to the directory of the file *currently being processed*; that could be an included macro file in the case of one macro file including another.

Immediately after the inserted macro content the program will insert a corresponding macro-end comment line of the form:

    //-include <path>

When adding a macro-inclusion comment in a script file, you do not need to incude the corresponding macro-end comment line; the program will insert it.

When a local script file is `pushed` to Fibery, each macro block within a source file (i.e. the lines between `//+include` and `//-include`, if present) will be **replaced with the current content of the referenced macro file**.

When pulling script files from Fibery, any macro content and comments will be left untouched, so after a `pull` operation your local script files will reflect what is actually in your Fibery Workspace. But each time a local script file gets `pushed` back to your Fibery workspace, all its macro blocks will first be replaced by the current macro files' content.

## RUNNING AUTOMATIONS SCRIPTS LOCALLY

This experimental feature runs an automation script (note: NOT an entire automation, just a script) locally by simulating Fibery's script environment and translating a supported subset of Fibery `context` calls into equivalent https calls to your Fibery Workspace API.

Currently only these Fibery script methods are implemented:

    fibery.executeSingleCommand()
    fibery.createEntity()
    fibery.createEntityBatch()
    fibery.deleteEntity()
    fibery.deleteEntityBatch()
    fibery.updateEntity()
    fibery.updateEntityBatch()

## PROGRAM COMMANDS IN DETAIL

### `fibscripts pull`

Download and save Fibery workspace Button and Rule Javascript actions. This will OVERWRITE existing local script files, so make sure you've committed any local changes before doing a pull.

Use the filter options to limit which Spaces/DBs/Buttons/Rules will be retrieved:

    --space       -s    Space   name filter
    --db          -d    DB      name filter
    --button      -b    Button  name filter
    --rule        -r    Rule    name filter
    OR:
    --url         -u    Specify URL of a specific automation to process (use instead of filters)
    --path        -p    Specify local path to a specific action file to process (use instead of filters)

### `fibscripts push`

Push local Javascript Button and Rule actions back to Fibery workspace. This will OVERWRITE Fibery script actions, so make sure the curent Workspace scripts are backed up. A `pull --fake` command (without `--cache`) will download the current Workspace scripts to local cache; `--fake` prevents overwriting your lcoal script files.

If the `--nofiles` option is specified, local Button and Rule script source files will be ignored, and their cached definitions will be pushed instead. In this case not only action scripts will be pushed but also the complete cached automation definitions. This allows restoring complete Button/Rule definitions from old cached versions.  For such a "restore" operation you can optionally use the `--before` and `--after` options to specify a particular cache to use (the default is the most recent cache file).

Use the filter options to limit which Spaces/DBs/Buttons/Rules will be updated:

    --space       -s    Space   name filter
    --db          -d    DB      name filter
    --button      -b    Button  name filter
    --rule        -r    Rule    name filter
    OR:
    --url         -u    Specify URL of a specific automation to process (use instead of filters)
    --path        -p    Specify local path to a specific action file to process (use instead of filters)

### `fibscripts purge --before {date-time}`

Purge local cache entries that were created on or before the specified cutoff date-time.

Older cache files are not automatically deleted. Use `purge` with `--before` to trim them.

Use the filter options to limit which Spaces/DBs/Buttons/Rules will be affected:

    --space       -s    Space   name filter
    --db          -d    DB      name filter

### `fibscripts orphans`

Search for "orphaned" local files and dirs that no longer correspond to the Fibery Workspace.

Use these filter options to limit which local Space/DB dirs will be checked:

    --space       -s    Space   name filter
    --db          -d    DB      name filter
    --button      -b    Button  name filter
    --rule        -r    Rule    name filter
    OR:
    --url         -u    Specify URL of a specific automation to process (use instead of filters)
    --path        -p    Specify local path to a specific action file to process (use instead of filters)

### `fibscripts validate`

Test automations for valid structure.

Use these filter options to limit which automations will be checked:

        --space       -s    Space   name filter
        --db          -d    DB      name filter
        --button      -b    Button  name filter
        --rule        -r    Rule    name filter

### `fibscripts run`

Run a Fibery automation script locally (experimental).

This command runs an automation script locally (note: NOT an entire automation, just a script) by simulating Fibery's script environment and translating a supported subset of Fibery `context` calls into equivalent https calls to your Fibery Workspace API. Specify the `--nice` option to have the app automatically check your Workspace's backend processing queues (Formulas, Automation Rules, Relation Linker and Search) and wait for them to clear before processing an API call.

Currently only these Fibery script context methods are implemented - if your script calls any others it will throw an error:

    fibery.executeSingleCommand()
    fibery.createEntity()
    fibery.createEntityBatch()
    fibery.deleteEntity()
    fibery.deleteEntityBatch()
    fibery.updateEntity()
    fibery.updateEntityBatch()

Use these filter options to select the scripts to be executed locally:

        --space       -s    Space   name filter
        --db          -d    DB      name filter
        --button      -b    Button  name filter
        --rule        -r    Rule    name filter
    OR:
        --url         -u    Specify URL of a specific automation to process (use instead of filters)
        --path        -p    Specify local path to a specific action script file to process (use instead of filters)

## EXAMPLES

    fibscripts  pull -b/ -r/                             # Pull ALL Button and Rule scripts from Fibery, overwriting existing local script files
    fibscripts  pull -b/ -r/ --noclobber                 # Pull Button and Rule scripts from Fibery, but don't overwrite any existing local script files
    fibscripts  pull -b/ -r/                             # Pull Button and Rule scripts from Fibery that don't already exist locally
    fibscripts  push -r/ -b/                             # Push ALL local Button and Rule scripts to Fibery, overwriting current Workspace scripts
    fibscripts  pull --space=test\* -b/                  # Pull all Button scripts from Spaces beginning with "test"
    fibscripts  pull --space='!/^test|^foo' -r/          # Pull all Rule scripts from all Fibery Spaces NOT beginning with "test" or "foo"
    fibscripts  pull --rule='/test|foo'                  # Pull Rule scripts from all Rules with names containing "test" or "foo"
    fibscripts  push --space='test*' -b/                 # Push all Button scripts in Spaces beginning with "test"
    fibscripts  push --db=bar -b'/test|foo'              # Push Button scripts for Buttons containing "test" or "Foo" in the "Bar" DB of any Space
    fibscripts  push --nofiles --before 2023-01-30 -b/   # Push cached Button definitions from latest cache files ≤ 2023-01-30
    fibscripts  purge --before 2023-01-30                # Delete local cache files created ≤ 2023-01-30
    fibscripts  orphans                                  # Find all "orphaned" local files and dirs that no longer correspond to the Fibery Workspace
    fibscripts  validate -b\* -r\*                       # Check all automations for valid structure
    fibscripts  run -sREPORTS -dCallStats -rCreateStats  # Run a script locally (experimental)
