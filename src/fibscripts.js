#!/usr/bin/env node
// fibscripts.js - Manage Fibery Automation Scripts Remotely
//---------------------------------------------------------------------------------------------------
// git push -u origin main

import got from 'got'
import   childProcess    from 'node:child_process'
import   path            from 'node:path'
import   fs              from 'node:fs'
import { parseArgs     } from 'node:util'
import   ora             from 'ora'                     // Console "busy" spinner
import   pc              from 'picocolors'              // Console colors

//---------------------------------------------------------------------------------------------------
//  Global vars

const appName           = path.basename( process.argv[1] ).replace(/\.[^.]+$/, '')    // Name of this program file without file extension
let   command, options, positionals, FIBERY, FIBERY_DOMAIN
let   domainDir                                         // Dir where everything for the Fibery workspace is stored
let   schema, spaces
let   cacheAfter, cacheBefore
let   appReturnCode     = 0                             // Program return code
let   debug             = false
let   spinner
let   useSpinner        = !process.env.IN_DEBUGGER
let   includedFrom                                      // Context message for expandScript() error reporting
const warned            = {}                            // Don't repeat identical warnings

//---------------------------------------------------------------------------------------------------
//  Helper functions

const debugBreak        = ()  => { if (debug || process.env.IN_DEBUGGER) debugger }
function timestamp()    { return new Date(...arguments).toLocaleString('sv', {year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric', second:'numeric', fractionalSecondDigits: 3}).replace(',', '.') }
const startTimestamp    = timestamp()
const stringify         = (...args) => args.map( (a) =>
        a===undefined       ? 'undefined' :
        a instanceof Error  ? `${appName}: ${a?.stack}` :
        typeof a==='object' ? JSON.stringify(a) :
        a.toString()
    ).join(' ')

const boldRed = (...args) => pc.reset(pc.red(...args))

function stopSpinner( funcName=null ) {
    if (spinner) {
        if (funcName && spinner.text && spinner.isSpinning)
            spinner[funcName](spinner.text)         // Keep current spinner message
        else if (spinner.text)
            spinner.stopAndPersist({symbol: ''})
        else
            spinner.stop()
    }
    if (useSpinner) spinner = ora({stream: process.stdout})
}

function log(...args) {
    if (useSpinner) {
        stopSpinner()
        spinner.start(stringify(...args))
    }
    else console.log(...args)
}

function dbg(...args) {
    if (!debug) return
    const msg = pc.reset(pc.dim(pc.cyan(stringify(...args))))
    if (useSpinner) {
        stopSpinner()
        spinner.start(msg)
    }
    else console.info(msg)
}

function error(err) {
    const msg = `${appName}: ${stringify(err?.stack ?? err.toString())}`
    stopSpinner()
    console.error(boldRed(msg))
    debugBreak()
    process.exit(appReturnCode || 1)
}

function warn(...args) {
    const msg = stringify(...args)
    if (warned[msg]) return
    warned[msg] = 1
    stopSpinner()
    console.warn(pc.reset(pc.yellow(msg)))
    return false
}

function assert(condition, ...msg) {
    if (condition) return condition
    debugBreak()
    throw Error(...msg)
}

const logResult         = (...args)             => { if (!options.quiet  ) log(pc.reset(pc.green(stringify(...args)))) }
const logResultRed      = (...args)             => { if (!options.quiet  ) log(boldRed(stringify(...args))) }
const logVerbose        = (...args)             => { if ( options.verbose) log(pc.reset(pc.magenta(stringify(...args)))) }
const myAssert          = (condition, msg)      => { if (condition) return condition; error(msg) }       // When we don't want a stack trace
const delay             = async (ms)            => new Promise((resolve) => setTimeout(resolve, parseInt(ms)))
const isaDirectory      = (path)                => { try { return fs.lstatSync(path).isDirectory() } catch(err) { return null } }
const doesPathExist     = (fpath)               => { try { return fs.statSync(fpath)               } catch(err) { return null } }
const doesDirContain    = (dirPath, fileName)   => doesPathExist(path.join(dirPath, fileName))
const joinNonBlank      = (delimiter, ...args)  => args?.filter( (arg) => arg!=null && arg!='' )?.join(delimiter)
const Capitalize        = (str)                 => str.replace(/^./, c => c.toUpperCase())
const isAScriptAction   = (action)              => action.meta.name==='Script'
const findScriptActions = (actions)             => actions.filter(isAScriptAction)
const fixWindowsFsChars = (fname)               => fname?.replace(/[:;\\|/<>]/g, '_')     // Replace disallowed characters for Windows filenames
// const classOf        = (o)                   => o?.constructor?.name ?? typeof(o)
const isAutomationEnabled = (a)                 => a.enabled
const hasAllFieldValues = (obj, fields)         => !fields.find( (f) => obj[f]==null || obj[f]==='')    // Object has all named members (non-null && nonblank)

//---------------------------------------------------------------------------------------------------
//  Setup
//

const commandLineOptions = {
    workspace:  { type: 'string',   short: 'w',                 },
    space:      { type: 'string',   short: 's',                 },   // default: match all Spaces
    db:         { type: 'string',   short: 'd',                 },   // default: match all DBs
    button:     { type: 'string',   short: 'b',                 },   // default: match  no Buttons
    rule:       { type: 'string',   short: 'r',                 },   // default: match  no Rules
    enable:     { type: 'string',   short: 'e',                 },
    cache:      { type: 'boolean',  short: 'c',                 },
    url:        { type: 'string',   short: 'u',                 },
    path:       { type: 'string',   short: 'p',                 },
    nogit:      { type: 'boolean',  short: 'g',  default: false },
    noclobber:  { type: 'boolean',  short: 'n',  default: false },
    fake:       { type: 'boolean',  short: 'f',  default: false },
    delay:      { type: 'string',   short: 'l',  default: '0'   },
    verbose:    { type: 'boolean',  short: 'v',  default: false },
    debug:      { type: 'boolean',               default: false },
    quiet:      { type: 'boolean',  short: 'q',  default: false },
    yes:        { type: 'boolean',  short: 'y',  default: false },
    nofiles:    { type: 'boolean',               default: false },
    validate:   { type: 'boolean',               default: false },
    'strict-validation':
                { type: 'boolean',  short: 't',  default: false },
    before:     { type: 'string',                               },
    after:      { type: 'string',                               },
    nice:       { type: 'boolean',                              },
    help:       { type: 'boolean',                              },
}

// Parse command line options
function parseCommandLineOptions() {
    try {
        const {values, positionals: pos} = parseArgs({ args: process.argv.slice(2), options: commandLineOptions, allowPositionals: true })
        options             = values
        positionals         = pos ?? []
        debug               = debug || options.debug
        if (debug)  options.verbose = true
    } catch (err) {
        myAssert(false, err.message)
    }
}

// Setup and validate inputs
async function doSetup( forceCache=null ) {
    if (options.workspace) process.env.FIBERY_DOMAIN = options.workspace            // `--workspace` option overrides FIBERY_DOMAIN env var
    FIBERY_DOMAIN       =  process.env.FIBERY_DOMAIN
    myAssert(FIBERY_DOMAIN, 'Fibery workspace domain must be defined by either FIBERY_DOMAIN env var or `--workspace` arg')

    // If FIBERY_DOMAIN is an entire path, split out FIBERY as the root path and FIBERY_DOMAIN as the domain dir (last part)
    if (FIBERY_DOMAIN?.indexOf(path.sep) >= 0) {
        domainDir       = FIBERY_DOMAIN
        FIBERY_DOMAIN   = path.basename(FIBERY_DOMAIN)
    } else {
        FIBERY          = process.env.FIBERY
        myAssert(isaDirectory(FIBERY), `FIBERY env var should hold the path to the root dir for all Fibery local domain/workspace dirs`)
        domainDir       = path.join(FIBERY, FIBERY_DOMAIN)
    }
    maybeCreateDir('workspace', domainDir)

    // Should we try calling fiberyConfig.sh to set FIBERY_API_KEY?
    if (!process.env.FIBERY_API_KEY) try {
        const moreEnvVars   = execFileSync('fiberyConfig.sh', ['-0', FIBERY_DOMAIN ?? '']).toString()
        // Add any returned env var definitions to process.env
        for( const line of moreEnvVars.split('\0') ) {
            const [, name, value] = line.match( /(\w+)=([^\0]*)/ ) ?? []
            if (name) process.env[name.trim()] = value.trim()
        }
    } catch (err) {}
    myAssert(process.env.FIBERY_API_KEY, `FIBERY_API_KEY env var is not defined for workspace "${FIBERY_DOMAIN}"`)

    // Set end of cache date range
    if (options.before) {
        cacheBefore = new Date(options.before.replace(/_/g, ':'))
        myAssert(!isNaN(cacheBefore), `Invalid \`--before\` date: "${options.before}"`)
    } else {
        cacheBefore = new Date()
        cacheBefore.setFullYear(1 + cacheBefore.getFullYear())  // one year in the future
    }

    // Set start of cache date range
    if (options.after) {
        cacheAfter = new Date(options.after.replace(/_/g, ':'))
        myAssert(!isNaN(cacheAfter), `Invalid \`--after\` date: "${options.after}"`)
    } else
        cacheAfter = new Date(0)                                // The distant past

    await getSpaces(forceCache)
    await getSchema(forceCache)
}

function help( cmd ) {
    switch (cmd || '') {

        case '':
            log(`
${appName} - Manage Fibery automation scripts locally, using UNDOCUMENTED Fbery.io API calls

OVERVIEW

This is a Node.js app that uses UNDOCUMENTED Fibery.io API calls to get and update automation scripts (Javascript) in your Fibery.io Button and Rule automations. This allows you to write and manage your Fibery scripts locally with familiar tools (including source control).

COMMANDS:

Usage:  ${appName}  { pull | push | purge | orphans | validate | run | help {cmd} }  [ options... ]

    help [cmd]            Show help, optionally for a specific program command
    pull                  Download and save Fibery workspace Button and Rule Javascript actions
    push                  Push local Javascript Button and Rule actions back to Fibery workspace
    purge --before {date} Delete cache entries older than the specified cutoff date
    orphans               List orphaned local files and dirs that were deleted in Fibery
    validate              Check automations for valid structure
    run                   Run an automation script locally (experimental)

OPTIONS: (can appear anywhere on the command line)

    --workspace          -w   The Fibery workspace domain, e.g. "my.fibery.io" - or, the full path to the local workspace dir
    --space              -s   Space   name filter
    --db                 -d   DB      name filter
    --button             -b   Button  name filter
    --rule               -r   Rule    name filter
    --url                -u   URL of a specific automation to process (use instead of filters)
    --path               -p   Local path to a specific action script file to process (use instead of filters)
    --cache              -c   Use existing cached Space/DB info instead getting it from Fibery
    --noclobber          -n   Don't overwrite any existing local scripts (used with pull/push)
    --enable             -e   Use option value of y/n to enable/disable automations
    --nogit              -g   Don't try to use git (when your local script files are not tracked in git)
    --nofiles                 Ignore local script files; use with \`push\` to restore automations from cache files
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

ENVIRONMENT VARIABLES:

    FIBERY                Base path for all local storage managed by the app (cache files and automation scripts)
    FIBERY_DOMAIN         The Fibery workspace domain to manage (or specify this with the \'--workspace\' option)
    FIBERY_API_KEY        API key for the Fibery workspace domain - get it from "Fibery Settings > API Keys"

BASIC OPERATION

    The Fibery workspace domain (e.g. "my.fibery.io") must be specified by the FIBERY_DOMAIN env var or the \`--workspace option\`. It also defines the directory name (under $FIBERY) where the hierarchy of Fibery scripts for the workspace will be stored.

    If FIBERY_DOMAIN is just the bare domain name without any other path components (e.g. just "my.fibery.io") then the FIBERY env var specifies the parent directory (e.g. "/home/me/fibery/") under a specific workspace directory will be stored.

    FIBERY_DOMAIN can alternatively specify the full path to the workspace directory (e.g. "/home/me/fibery/my.fibery.io"), in which case the FIBERY env var is ignored.

    Use \`${appName} pull\` to pull automation scripts from a Fibery workspace and store them in local *.js files under a directory hierarchy that mirrors the workspace's Spaces and DBs.

    Use \`${appName} push\` to push local *.js script files back to the Fibery workspace. Comments are inserted at the top of each script for identification and git info.

    The options \`--space\` \`--db\` \`--button\` and \`--rule\` define name filters to define and limit which Fibery elements will be processed by a command. These filters operate on Fibery object names, not file names.
    
    The \`--url\` and \`--path\` options are an alternative way to specify a single Fibery automation or script, respectively, to be processed by a command.

FILTERS:

    Filters are used to define the scope of a program operation by defining which Spaces/DBs/Buttons/Rules will be affected.

    Filters are glob-like by default, or regex if preceded by '/' (trailing slash is not required). Any filter is negated if the first character is '!'. Filters are always case-insensitive.

    If no filter is specified for Space or DB, ALL Spaces/DBs will be processed.

    If no filter is specified for a Button/Rule, NONE will be processed. So you must specify either the \`--button\` or \`--rule\` filter (or both) in order for any automations to be processed.

    At most of one filter can be defined per category (Space/DB/Button/Rule). All supplied filters must match an item for it to be processed.

    Instead of using the filters to specify an automation for \`pull\` or \`push\` or \`validate\` or \`run\`, you can use the \`--url\` or \`-path\` option to specify the URL or local file path of a single Fibery Button/Rule automation/script to process.

DIRECTORY STRUCTURE

    \`${appName}\` stores the data pulled from a Fibery Workspace in a hierarchy of local folders. These directories are automatically created as needed if the \`--yes\` option is specified. If \`--yes\` is not specified an error is generated for a missing directory.

    The base directory containing all Fibery workspaces is defined by the FIBERY or FIBERY_DOMAIN env var. The directory structure mostly mirrors the URL structure of automations, e.g.:
    "my.fibery.io/fibery/space/{SpaceName}/database/{DBName}/automations/{button or rule}/{automation name}". The only difference from the URLs is that an automation name is used in the path instead of the ID that is used in URLs.
    E.g., the URL:        "https://my.fibery.io/fibery/space/Projects/database/Tasks/automations/button/64ac4ff5ff58afe1abad6537/actions"
    would correspond to:  "my.fibery.io/fibery/space/Projects/database/Tasks/automations/button/My Button Name ~{id}.js"

    The workspace to use must be specified via the FIBERY_DOMAIN env var or the \`--workspace\` option; e.g. \`--workspace=my.fibery.io\`.

    Each script action in a Button/Rule automation will be stored in its respective directory as described above, named either \`{Button-name} ~{id}.js\` or \`{Rule-name} ~{id}.js\`. The '{id}' within the name is used to correlate each script file to a particular action within the automation (because there could be more than one script-action within an automation).

    The program will detect when a Space/DB/Automation has been renamed in Fibery, and if the \`--yes\` program option was specified the program will try to rename the corresponding local file/directory to match the new Fibery name using \`git mv\` (unless \`--nogit\` is specified, in which case the directory is renamed with the default OS rename functions).

    Some cache directories and housekeeping files are also created throughout the file hierarchy; their names always begin with a period.

CACHING

    The result of every Fibery API query that returns part of the Workspace is stored in a local cache file or directory that begins with a period. These cached API results can be reused by the program instead of re-querying Fibery by specifying the \`--cache\` option. This can save time especially if you have many Spaces and DBs and automations.

    These cache files also serve as backups, since they contain the complete definitions of all automations pulled from Fibery (not just the actual scripts).

    Old cache files are not automatically deleted; Use the \`purge\` program command to trim them.

    When the \`--cache\` option is specified without any dates, the most recent cache files will be used. If you want the program to use different (earlier) cache files, specify a date range with the \`--before\` and \`--after\` options. A cache file's filename encodes its creation date+time, and this is used to find the most recent cache files within the date range specified by \`--before\` and \`--after\`. When a date range is specified, the program will always use the most recent cache files found within that range.

SCRIPT MACROS

    A simple macro feature allows your local script files to "include" other source files. Macros are expanded recursively, so they can include other macros.

    Within a script file, including the content of a different source file is accomplished by specifying its path in a single-line comment of the form:
        //+include <path>

    This directs the program to insert the file specified by <path> before the next line. The comment must start at the beginning of a line (no preceding whitespace).

    If the <path> begins with the "@" symbol, the "@" is replaced with the current FIBERY_DOMAIN directory path.

    A relative path is interpreted relative to the directory of the file *currently being processed*; that could be an included macro file in the case of one macro file including another.

    Immediately after the inserted macro content the program will insert a corresponding macro-end comment line of the form:
    
        //-include <path>
    
    When adding a macro-inclusion comment in a script file, you do not need to incude the corresponding macro-end comment line; the program will insert it.

    When a local script file is \`pushed\` to Fibery, each macro block within a source file (i.e. the lines between \`//+include\` and \`//-include\`, if present) is replaced with the current content of the referenced macro file.

    When pulling script files from Fibery, any macro content and comments will be left untouched, so after a \`pull\` operation your local script files will reflect what is actually on the server. But each time a local script file gets \`pushed\` back to your Fibery workspace, all its macro blocks will first be replaced by the current macro files' content.

RUNNING AUTOMATIONS SCRIPTS LOCALLY

    This experimental feature runs an automation script (note: NOT an entire automation, just a script) locally by simulating Fibery's script environmnet, translating a supported subset of Fibery \`context\` calls into equivalent https calls to your Fibery Workspace API.

    Currently only these Fibery script methods are implemented:

        fibery.executeSingleCommand()
        fibery.createEntity()
        fibery.createEntityBatch()
        fibery.deleteEntity()
        fibery.deleteEntityBatch()
        fibery.updateEntity()
        fibery.updateEntityBatch()

EXAMPLES

    ${appName}  pull -b/ -r/                             # Pull ALL Button and Rule scripts from Fibery, overwriting existing local script files
    ${appName}  pull -b/ -r/ --noclobber                 # Pull Button and Rule scripts from Fibery, but don't overwrite any existing local script files
    ${appName}  pull -b/ -r/                             # Pull Button and Rule scripts from Fibery that don't already exist locally
    ${appName}  push -r/ -b/                             # Push ALL local Button and Rule scripts to Fibery, overwriting current Workspace scripts
    ${appName}  pull --space=test\\* -b/                  # Pull all Button scripts from Spaces beginning with "test"
    ${appName}  pull --space='!/^test|^foo' -r/          # Pull all Rule scripts from Fibery Spaces NOT beginning with "test" or "foo"
    ${appName}  pull --rule='/test|foo'                  # Pull Rule scripts from all Rules with names containing "test" or "foo"
    ${appName}  push --space='test*' -b/                 # Push all Button scripts in Spaces beginning with "test"
    ${appName}  push --db=bar -b'/test|foo'              # Push Button scripts for Buttons containing "test" or "Foo" in the "Bar" DB of any Space
    ${appName}  push --nofiles --before 2023-01-30 -b/   # Push cached Button definitions from latest cache files ≤ 2023-01-30
    ${appName}  purge --before 2023-01-30                # Delete local cache files created ≤ 2023-01-30
    ${appName}  orphans                                  # Find all "orphaned" local files and dirs that no longer correspond to the Fibery Workspace
    ${appName}  validate -b\\* -r\\*                       # Check all automations for valid structure
    ${appName}  run -sREPORTS -dCallStats -rCreateStats  # Run a script locally (experimental)
`)
            break

        case 'pull':
            log(`
${appName} pull

    Download and save Fibery workspace Button and Rule Javascript actions. This will OVERWRITE existing local script files, so make sure you've committed any local changes before doing a pull.

    Use the filter options to limit which Spaces/DBs/Buttons/Rules will be retrieved:
        --noclobber   -n    Don't overwrite any existing local script files
        --space       -s    Space   name filter
        --db          -d    DB      name filter
        --button      -b    Button  name filter
        --rule        -r    Rule    name filter
    OR:
        --url         -u    Specify the URL of a specific automation to process
        --path        -p    Specify the local path to a specific action script file to process
`)
            break

        case 'push':
            log(`
${appName} push

    Push local Javascript Button and Rule actions back to Fibery workspace. This will OVERWRITE Fibery script actions, so make sure the curent Workspace scripts are backed up. A \`pull --fake\` command (without \`--cache\`) will download the current Workspace scripts to local cache; \`--fake\` prevents overwriting your lcoal script files.

    If the \`--nofiles\` option is specified, local Button and Rule script source files will be ignored, and their cached automation definitions will be pushed instead. In this case not only action scripts will be pushed but also the complete (cached) automation definitions. This allows restoring complete Button/Rule definitions from old cached versions. For such a "restore" operation you can optionally use the \`--before\` and \`--after\` options to specify a particular cache to use (the default is the most recent cache file).

    Use the filter options to limit which Spaces/DBs/Buttons/Rules will be updated:
        --space       -s    Space   name filter
        --db          -d    DB      name filter
        --button      -b    Button  name filter
        --rule        -r    Rule    name filter
    OR:
        --url         -u    Specify the URL of a specific automation to process
        --path        -p    Specify the local path to a specific action script file to process
`)
            break

        case 'purge':
            log(`
${appName} purge --before {date-time}

    Purge local cache entries that were created on or before the specified cutoff date-time.

    Older cache files are not automatically deleted. Use \`purge\` with \`--before\` to trim them.

    Use the filter options to limit which Spaces/DBs/Buttons/Rules will be affected:
        --space       -s    Space   name filter
        --db          -d    DB      name filter
`)
            break

        case 'orphans':
            log(`
${appName} orphans

    Search for "orphaned" local files and dirs that no longer correspond to the Fibery Workspace.

    You can use these filter options to limit which local Space/DB dirs will be checked:
        --space       -s    Space   name filter
        --db          -d    DB      name filter
`)
            break

        case 'validate':
            log(`
${appName} validate

    Test automations for valid structure.

    You can use these filter options to limit which automations will be checked:
        --space       -s    Space   name filter
        --db          -d    DB      name filter
        --button      -b    Button  name filter
        --rule        -r    Rule    name filter
    OR:
        --url         -u    Specify the URL of a specific automation to process
        --path        -p    Specify the local path to a specific action script file to process
`)
            break

        case 'run':
            log(`
${appName} run

    Run a Fibery automation script locally (experimental).

    This command runs an automation script locally (note: NOT an entire automation, just a script) by simulating Fibery's script environment and translating a supported subset of Fibery \`context\` calls into equivalent https calls to your Fibery Workspace API. Specify the \`--nice\` option to have the app automatically check your Workspace's backend processing queues (Formulas, Automation Rules, Relation Linker and Search) and wait for them to clear before processing an API call.

    Currently only these Fibery script context methods are implemented - if your script calls any others it will throw an error:
    
        fibery.executeSingleCommand()
        fibery.createEntity()
        fibery.createEntityBatch()
        fibery.deleteEntity()
        fibery.deleteEntityBatch()
        fibery.updateEntity()
        fibery.updateEntityBatch()

    You can use these filter options to select the scripts to be executed locally:
        --space       -s    Space   name filter
        --db          -d    DB      name filter
        --button      -b    Button  name filter
        --rule        -r    Rule    name filter
    OR:
        --url         -u    Specify the URL of a specific automation to process
        --path        -p    Specify the local path to a specific action script file to process
`)
            break

        default:
            error(`Unrecognized command "${cmd}"`)
    }
    appReturnCode = 1
}

// Make a Fibery API call
async function fiberyFetch( address, method, body=null ) {
    let   response
    const url       = `https://${FIBERY_DOMAIN}${address}`
    const payload   = {
        method,
        headers: {
            'Content-type':  'application/json; charset=utf-8',
            'Authorization': `Token ${process.env.FIBERY_API_KEY}`,
    }}
    // if (body) payload.body = typeof body==='string' ? body : JSON.stringify(body)
    // dbg(`fiberyFetch:\t${method} ${url}\t${JSON.stringify(payload)}`)
    if (body) payload.json = typeof body==='object' ? body : JSON.parse(body)
    dbg(`fiberyFetch:\t${method} ${url}\t${JSON.stringify(payload)}`)
    try {
        if (options.fake && method==='PUT') return null
        await delay(options.delay)
        // response = await fetch(url, payload)
        // if (response?.status==200) return response.json()
        // error(`${response?.status}: ${response?.statusText}\n${url}`, method, body)

        const response = await got(url, {...payload, resolveBodyOnly:false, responseType:'text'})
        if (response?.statusCode==200) return JSON.parse(response.body)
        error(`${response?.statusCode}: ${response?.statusText}\n${url}`, method, payload)    
    } catch (err) {
        error(`${joinNonBlank('\n', err?.cause, response?.status, response?.statusText, err?.message)}\n${url}`)
    }
}

// Class to represent user-defined Spaces and Types in a Fibery Workspace
class FiberyWorkspaceSchema {
    constructor( schemaRaw ) {
        // Get Types (DBs)
        this.types = Object.fromEntries(
            schemaRaw['fibery/types']
            .filter( t => !( t['fibery/deleted?'] ||
                             t['fibery/meta']?.['fibery/enum?'] ||
                             t['fibery/name'].match(/^[a-z]|^Collaboration~Documents\/|^Files\/Files-mixin/) ))
            .map(    t =>  [ t['fibery/name'], t ] ) )
        this.spaces = {}
        // Add more info to Types and build spaces global
        for (const [dbName, type] of Object.entries(this.types)) {
            const  [,sName, tName]  = dbName.match( /(.*)\/(.*)/ )
            type.name               = tName
            type.space              = sName
            this.spaces[sName]    ??= { name: sName, types: {} }
            this.spaces[sName].types[dbName] = type
            spaces[sName].types   ??= this.spaces[sName].types
        }
    }
}

const dbName_from_dbId = (dbId) => Object.values(schema.types).find( t => t['fibery/id']===dbId )?.name
// const spaceId_from_spaceName = (spaceName) => spaces[spaceName].id


//---------------------------------------------------------------------------------------------------
//  OS File & Process functions
//

// Readdir (sync, no exceptions thrown)
function readdirSync( dir ) {
    try { return fs.readdirSync(dir) }
    catch(err) { return [] }
}

// Readfile (sync, no exceptions thrown)
function readFileSync( path ) {
    try { return fs.readFileSync(path).toString() }
    catch(err) { return null }
}

// Ensure that all directory-separators in a path correspond to the host OS
// So you cannot have backslashes in a Linux path!
function fixPathSeparators( filePath ) {
    const correctSep = path.sep, wrongSep = correctSep==='/' ? '\\' : '/'
    return filePath.replace( new RegExp('\\'+wrongSep, 'g'), correctSep )
}

// Execute a subprocess  (sync, no exceptions thrown)
function execFileSync( cmd, args, options ) {
    try {
        let result = childProcess.execFileSync(cmd, args, options)
        return result.toString()
    }
    catch (err) {
        err.stderr  = err.stderr?.toString()
        err.message = err?.output
            ?.map(    o => o?.toString())
            ?.filter( o => o!=null && o!='' )
            ?.join('\n')
            ?.replace(/[\r\n\s]+$/, '')
        return err
    }
}

// Execute a git command synchronously
const execGitCommandSync = (gitArgs, execOptions) => execFileSync('git', gitArgs, execOptions)

// Check whether a file is tracked in git
// function isFileTracked( filePath ) {
//     const  result = execGitCommandSync('ls-files', '--error-unmatch', filePath)
//     return !(result instanceof Error)
// }

// Create a token filename to identify a space/type dir
const tokenFileName = (tokenType, id) => `.${id}.${tokenType}`

// Create a dir (and maybe token file) if it doesn't already exist (maybe)
function maybeCreateDir( type, dir, tokenFile=null ) {
    if (!isaDirectory(dir)) {
        myAssert(!doesPathExist(dir), `Can't create missing ${type} directory because it is a file:\t${dir}`)
        myAssert(options.yes || options.fake, `Missing ${type} directory "${dir}" - Use the \`--yes\` option to create missing directories automatically`)
        warn(`Creating ${Capitalize(type)} dir:\t${dir}`)
        if (!options.fake) fs.mkdirSync(dir, {recursive: true})
    }
    if (tokenFile) {
        // Create the dir's token file (to identify the dir by its Fibery id)
        const tokenPath = path.join(dir, tokenFile)
        if (!doesPathExist(tokenPath) && !options.fake) fs.writeFileSync(tokenPath, '')
    }
    return dir
}

// Check whether an existing file/dir should be renamed, and maybe rename it.
// When a local file/dir is found via its Fibery id, but it has a different name than what's in Fibery,
// then we should rename it to keep the local file name in sync with its Fibery name.
function maybeRenameExisting( typeDescription, existingPath, idealPath ) {
    if (!existingPath) return idealPath
    if (existingPath===idealPath) return idealPath
    const existingDir   = path.dirname(existingPath)
    const idealFile     = path.basename(idealPath)
    assert(existingDir !=='.', 'existingPath was passed as basename only')
    if (!options.yes) {
        warn(`Existing ${typeDescription} "${existingPath}" should be renamed to "${idealPath}" - Use the \`--yes\` option to rename automatically`)
        return existingPath
    }
    // Should be renamed
    if (doesPathExist(idealPath)) {
        warn(`Target "${idealFile}" exists, can't rename ${typeDescription} from:\t"${existingPath}"`)
        return existingPath
    }
    warn(`Renaming ${typeDescription}:\t"${existingPath}"\t"${idealFile}"`)
    if (options.fake ) return existingPath
    if (!options.nogit) {
        // Try renaming with `git mv`
        const gitmv = execGitCommandSync(['mv', existingPath, idealPath], {cwd: domainDir})
        if (gitmv.status==null || gitmv.status==0)
            return idealPath                                        // `git mv` success
        else if (gitmv?.message?.match(/not under version control|is outside repository/)) {
            // Do a regular OS rename (fall through)
        }
        else {
            warn('git mv: ' + gitmv.message)
            debugBreak()            // What??
            return existingPath
        }
    }
    // Regular OS rename
    fs.renameSync(existingPath, idealPath)
    return idealPath
}

// Test whether the specified file's content matches the pattern
function testFileContentMatch( filePath, pattern ) {
    const  content = readFileSync(filePath)
    return content?.match(pattern)
}

// Find an existing script file by its identifying script-id header comment
function find_scriptFile_byHeader( dbDir, idealFilePath, idHeaderComment ) {
    // Test the ideal filePath first
    if (testFileContentMatch(idealFilePath, idHeaderComment)) return idealFilePath
    // Look for a script file in the dbDir that contains the specified header line
    const ext   = path.extname(idealFilePath)                     // Extension including the '.'
    const found = readdirSync(dbDir)?.find(
        (fname) => fname.endsWith(ext) && testFileContentMatch( path.join(dbDir, fname), idHeaderComment )
    )
    if (!found) return null
    return path.join(dbDir, found)
}

// Find a subdir that comtains the named tokenFile
function findSubdirByTokenFile( parentDir, tokenFileName ) {
    const found = readdirSync(parentDir)?.find(
        (subdir) => doesDirContain( path.join(parentDir, subdir), tokenFileName ))
    return found ? path.join(parentDir, found) : null
}

// Get the local dir for a Space
function getSpaceDir( space=null ) {
    if (!space) return path.join(domainDir, 'fibery')
    const tokenFile     = tokenFileName('space', space.id)                      // Identifies a Space by its Id
    const parentDir     = path.join(domainDir, 'fibery', 'space')
    const idealDir      = path.join(parentDir, fixWindowsFsChars(space.name))   // This is what the dirName should be ideally
    const foundDir      = findSubdirByTokenFile(parentDir, tokenFile)
    return foundDir ? maybeRenameExisting('space directory', foundDir, idealDir)
                    : maybeCreateDir('space', idealDir, tokenFile)
}

// Get the local dir for a DB by its Id
function getDbDir( space, dbId ) {
    const spaceDir      = getSpaceDir(space)
    if (!dbId) return spaceDir                                                  // Space dir not specific to any DB
    const dbName        = dbName_from_dbId(dbId)
    const tokenFile     = tokenFileName('db', dbId)                             // Identifies a DB by its Id
    const parentDir     = path.join(spaceDir, 'database')
    const idealDir      = path.join(parentDir, fixWindowsFsChars(dbName))       // This is what the dirName should be ideally
    const foundDir      = findSubdirByTokenFile(parentDir, tokenFile)
    return foundDir ? maybeRenameExisting('DB directory', foundDir, idealDir)
                    : maybeCreateDir('DB', idealDir, tokenFile)
}

//---------------------------------------------------------------------------------------------------
//  Cache functions
//

// Get the cache dir path for a particular DB and cacheType
function getCacheDir( space, dbId, cacheType ) {
    const dir = path.join(getDbDir(space, dbId), `.${cacheType}-cache`)
    return maybeCreateDir(cacheType, dir)
}

// Select the most recent cache file in cacheDir created in the period between cacheAfter and cacheBefore
function selectCacheFile( cacheDir ) {
    // Cache filenames are a munged timestamp of the start time of the program run that created them (colons=>underscores)
    const file = readdirSync(cacheDir)
        ?.sort( (a, b) => -a.localeCompare(b) )              // Sort descending = most recent first
        ?.find( (name) => {
            const m = name.match(/^(\d\d\d\d-\d\d-\d\d \d\d_\d\d_\d\d\.\d+)\.jsonc$/)
            if (!m) return false
            const date = new Date( m[1].replace(/_/g, ':') )
            if (isNaN(date)) return false
            return date>cacheAfter && date<=cacheBefore
        })
    return file
}

// Get a cached OR fresh API object
async function cachify( space, dbId, cacheType, forceCache, creatorFunc ) {
    const cacheDir          = getCacheDir(space, dbId, cacheType)
    if (forceCache ?? options.cache) {
        // Get cached data if available
        const cacheFile     = selectCacheFile(cacheDir)
        if (cacheFile) {
            const cachePath = path.join(cacheDir, cacheFile)
            dbg(`reading cache:\t${cachePath}`)
            let content     = readFileSync(cachePath)
            while (!content.match(/^\s*[[{}]/))             // Delete any cruft/comments before start of JSON
                content     = content.replace(/.*[\r\n]*/, '')
            return JSON.parse(content)
        } else if (cacheType.match(/button|rule/i))
             myAssert(!options.nofiles, `A cache file must be used with the \`--nofiles\` option, but none was found for "${cacheDir}" - check your \`--before\` and \`--after\` options.`)
    }

    // Get fresh data and write to a new cache entry
    const obj           = await creatorFunc()
    const timestamp     = fixWindowsFsChars(startTimestamp)
    const cachePath     = path.join(cacheDir, `${timestamp}.jsonc`)
    const content       = `//# ${cachePath}\n` + JSON.stringify(obj)
    dbg(`saving cache:\t${cachePath}`)
    if (!options.fake) fs.writeFileSync(cachePath, content)
    return obj
}

//---------------------------------------------------------------------------------------------------

// Get the Workspace schema
async function getSchema( forceCache=null ) {
    const data     = await cachify(null, null, 'schema', forceCache, async() => {
        const data = await fiberyFetch('/api/commands', 'POST', '[{"command":"fibery.schema/query"}]')
        myAssert(data?.[0]?.success, `Error retrieving schema for ${FIBERY_DOMAIN} - check your FIBERY_API_KEY`)
        return data
    })
    schema = new FiberyWorkspaceSchema( data[0].result )
}

// Get the list of Spaces in the Fibery workspace
async function getSpaces( forceCache=null ) {
    spaces = await cachify(null, null, 'spaces', forceCache, async() => {
        const data = await fiberyFetch('/api/commands?reason=preload&command=fibery.app/get-available-apps', 'POST', '[{"command":"fibery.app/get-available-apps","args":{}}]')
        myAssert(data?.length > 0, `Could not read spaces for ${FIBERY_DOMAIN} - check your FIBERY_API_KEY`)
        const result            = {}
        for (const space of data[0].result) {
            const name          = space['app-namespace']
            if (!name.match(/^[a-z]|^Collaboration~Documents$|^Files$/)) {
                const id        = space['app-id']
                result[name]    = {name, id}
            }
        }
        myAssert(Object.keys(result)?.length > 0, `Did not fetch any user Fibery Spaces from Workspace "${FIBERY_DOMAIN}"`)
        return result
    })
}

// Create a filter function for the names of Spaces/DBs/Rules/Buttons
function makeFilter( pattern, field='name' ) {
    if (!pattern)                       return () => false      // Matches nothing
    if (pattern==='*' || pattern==='/') return () => true       // Matches everything
    const negate        = pattern.startsWith('!')               // Start a pattern with '!' to negate it
    if (negate) pattern = pattern.slice(1)
    const makeReFilter  = (pat, field, negate) => {
        try {
            const re        = new RegExp(pat, 'i')
            return (obj) => {
                const n = !re.exec(typeof obj==='string' ? obj : obj[field])
                return negate ? n : !n
            }
        } catch(err) {
            if (!err.message.match(/Invalid regular expression/)) throw err
            myAssert(false, `Invalid filter: ${pattern}`)
        }
    }
    return pattern.startsWith('/') ?
        makeReFilter( pattern.substr(1).replace(/\/$/, ''), field, negate )     // Regex: strip optional ending slash
      : makeReFilter( `^${ pattern                                              // Convert globbish pattern to regex
                .replace(/(?<!\\)\[!/g, '[^')
                .replace(/\*+/g, '.*')
                .replace(/\?/g, '.')}$`,
             field, negate )
}

// If the `--url` option is supplied, urlFilter.fields will hold the parsed url fields
const urlFilter = {
    fields      : {},
    findAuto    : (autos)   => autos.find( (a) => a.id===urlFilter.fields.id ),
    findSpace   : (spaces)  => {
        // In urlFilter.fields.space, " " are replaced with underscores
        const matchSpaceName = new RegExp( urlFilter.fields.space.replace(/_/g, '[ _]') )
        return spaces?.[ Object.keys(spaces).find((s) => matchSpaceName.exec(s)) ]
    },
    findDb      : (space)   => {
        // In urlFilter.fields.db, " " are replaced with underscores
        const matchDbName   = new RegExp( urlFilter.fields.db.replace(/_/g, '[ _]') )
        const dbName        = Object.keys(space.types).find( (n) => n.match(matchDbName))
        return space.types[dbName]
    },
}

// If the `--path` option is supplied, pathFilter.fields will hold the parsed path fields
const pathFilter = {
    fields      : {},
    findAuto    : (autos)   => {
        const idMatcher = new RegExp( pathFilter.fields.id + '$' )      // last 4 chars of action id
        return autos.find( (auto) => auto.actions.find( (action) => action.id.match(idMatcher) ) )
    },
    findSpace   : (spaces)  => spaces?.[ Object.keys(spaces).find((s) => s===pathFilter.fields.spaceName) ],
    findDb      : (space)   => space.types[ `${space.name}/${pathFilter.fields.dbName}` ],
}

// Generate all Spaces that pass the Space filter
function* spaces_filtered() {
    if (options.url) {
        const space = urlFilter.findSpace(spaces)
        if (space) yield space
    }
    else if (options.path) {
        const space = pathFilter.findSpace(spaces)
        if (space) yield space
    }
    else {
        yield* Object.values(spaces)
            .filter( makeFilter(options.space) )
            .sort(  (a,b) => a.name.localeCompare(b.name) )
    }
}

// Generate all DBs in the given space that pass the DB filter
function* dbs_filtered( space ) {
    if (!space?.types) return            // This Space has NO types/DBs defined
    if (options.url)
        yield urlFilter.findDb(space)
    else if (options.path)
        yield pathFilter.findDb(space)
    else {
        yield* Object.values(space.types)
            .filter( makeFilter(options.db) )
            .sort(  (a,b) => a['fibery/name'].localeCompare(b['fibery/name']) )
    }
}

// Generate all Buttons that pass the Buttons filter
function* buttons_filtered( buttons ) {
    if (!buttons) return
    if (options.url) {
        if (urlFilter.fields.kind==='button') {
            const btn = urlFilter.findAuto(buttons)
            if (btn) yield btn
        }
    }
    else if (options.path) {
        if (pathFilter.fields.kind==='button') {
            const btn = pathFilter.findAuto(buttons)
            if (btn) yield btn
        }
    }
    else {
        yield* buttons
            .filter( makeFilter(options.button) )
            .sort(  (a,b) => a.name.localeCompare(b.name) )
    }
}

// Generate all Rules that pass the Rules filter
function* rules_filtered( rules ) {
    if (!rules) return
    if (options.url) {
        if (urlFilter.fields.kind==='rule') {
            const rule = urlFilter.findAuto(rules)
            if (rule) yield rule
        }
    }
    else if (options.path) {
        if (pathFilter.fields.kind==='rule') {
            const rule = pathFilter.findAuto(rules)
            if (rule) yield rule
        }
    }
    else {
        yield* rules
            .filter( makeFilter(options.rule) )
            .sort(  (a,b) => a.name.localeCompare(b.name) )
    }
}

// Return the appropriate Fibery automations API subpath for buttons or rules
const getAutomationKindSubpath = (kind) =>
    kind.match( /rule/i   ) ? 'auto-rules' :
    kind.match( /button/i ) ? 'buttons'    :
    assert(false)

// Get all Button/Rule definitions for a DB
async function getDBAutomations( kind, space, dbId, forceCache=null ) {
    const result = await cachify(space, dbId, kind, forceCache,
        async() => fiberyFetch(`/api/automations/${getAutomationKindSubpath(kind)}/for-type/${dbId}`, 'GET'))
    assert(result instanceof Array)
    return result
}

// Generate the Id comment line for a script
const scriptIdHeader = (automationId, actionId) => `//.fibery AUTOID=${automationId} ACTIONID=${actionId}\n`

// Generate the git header block comment for a script
function scriptGitHeader( filePath ) {
    if (options.nogit) return ''
    const cwd   = path.dirname(filePath), filename = path.basename(filePath)
    let gitlog  = execGitCommandSync(['log', '--decorate', '-n1', '--', filename], {cwd})
    if (gitlog.status) {
        warn(gitlog.stderr)
        return ''
    }
    gitlog      = gitlog.toString()
    if (!gitlog) return ''
    // Return a C-style comment block containing the git log info
    return '/*.git\n'
        + gitlog.split('\n')
            .map( line => '** '+line )
            .join('\n')
        + '\n*/\n'
}

// Remove fibscripts header comments from a script
const deleteScriptHeaders = (script) => script?.replace(/\/\/.fibery\s+.*[\r\n]+/, '')
                                              ?.replace(/\/\*.git\b[\s\S]*?\*\/\s*[\r\n]+/, '')

// Get a script file's content, expanding any macros
function expandScript( scriptPath ) {
    const src               = path.basename(scriptPath)
    const script            = readFileSync(scriptPath)
    myAssert(script!=null, `Script file not found: ${scriptPath}${includedFrom}`)
    const lines             = script.split(/\r\n|\r|\n/)
    let   result            = ''
    // Process each script line
    for (let lineNo=0; lineNo<lines.length; lineNo++) {
        if (!lines[lineNo].startsWith('//+include ')) {
            // Perform macro substitutions
            const line      = lines[lineNo].replace(/\$SRC\b/g, `"${src}:${lineNo+1}"`) + '\n'
            // result          += (result ? '\n':'') + line
            result          += line
            continue
        }
        // Found a file-inclusion-macro-start comment line
        includedFrom        = `\n  included from: ${scriptPath}` + includedFrom
        const includeStart  = lines[lineNo]
        const includeEnd    = includeStart.replace('//+', '//-')                          // comment line that marks the macro end
        let   includePath   = includeStart.match( /\s+(.*)/ )?.[1]
                            ?.trim()?.replace(/^(["'])(.*)\1$/, "$2")                   // strip quotes surrounding the macro path
        myAssert(includePath, `Missing file-include path on line ${lineNo} of ${scriptPath}${includedFrom}`)
        includePath         = fixPathSeparators( includePath.replace(/^@/, domainDir) )   // Substitute leading "@" with domainDir
        if (includePath.startsWith('..'))                                                 // Interpret relative path relative to scriptPath
            includePath     = path.normalize(path.join(path.dirname(scriptPath), includePath))
        const includeContent= expandScript(includePath)
        result              += (result ? '\n':'') + `${includeStart}\n${includeContent}\n${includeEnd}\n`
        // Skip over old macro content up to the macro-end line
        const macroEndLineNo = lines.findIndex( (line) => line===includeEnd )
        if (macroEndLineNo > -1) lineNo = macroEndLineNo
    }
    return result
}


// Perform macro substitutions on a script
// function macroSubstitutions( text ) {
//     let result = '', lineNo = 0
//     for (let line of text.split(/\r\n|\r|\n/)) {
//         ++lineNo
//         result += line.replace(/\b__LINE__\b/g, lineNo) + '\n'
//     }
//     return result
// }


// Get a Space/DB Id from its token file
function getDirTokenId( path, suffix ) {
    const  tokenFilename = readdirSync(path)?.find( name => name.endsWith(suffix) )
    return tokenFilename?.replace(/^\.?([-\w]+)\.\w*/, '$1')
}

// Get the automation Ids from the API header comment in a script file
function parseFileActionIds( scriptFilePath ) {
    const  fileText = readFileSync(scriptFilePath)
    const  [, scriptId,  actionId] = fileText.match(/\/\/\.fibery\s+AUTOID=([-\w]+)\s+ACTIONID=([-\w]+)/) || []
    return [scriptId, actionId]
}

// Find a specific Button/Rule action by Id in automations
function findActionInAutomations( automations, scriptId, actionId ) {
    const autom         =     automations.find( a => a.id===scriptId )             // find the automation
    const action        = autom?.actions?.find( a => a.id===actionId )             // find the action
    return action
}

// Find the local *.js script file that corresponds to a particular automation action
function localActionScriptPath( dbDir, automationKind, automationName, automationId, actionId ) {
    const idHeader      = scriptIdHeader(automationId, actionId)
    const scriptAction  = actionId.slice(-4)                                // Differentiates multiple scripts in the same Automation
    const fileName      = fixWindowsFsChars(`${automationName} ~${scriptAction}.js`)  // This is what the script filename should be
    const dir           = path.join(dbDir, 'automations', automationKind.toLowerCase())
    const idealFile     = path.join(dir, fileName)
    maybeCreateDir(automationKind, dir)
    const existingFile  = find_scriptFile_byHeader(dir, idealFile, idHeader)
    if ( !existingFile) return idealFile
    assert(path.dirname(existingFile)!=='.', "oops")  //DEBUG
    return maybeRenameExisting('script', existingFile, idealFile)
}

// Save an automation action script locally
function saveLocalActionScript( dbDir, automationKind, automation, action ) {
    const script        = action.args.script.value
    const scriptPath    = localActionScriptPath(dbDir, automationKind, automation.name, automation.id, action.id)
    if (options.noclobber && doesPathExist(scriptPath))
        return warn(`Noclobber script:\t"${scriptPath}"`)
    const apiHeader     = scriptIdHeader(automation.id, action.id)
    const bareScript    = deleteScriptHeaders(script)
    const newScript     = `${apiHeader}\n${bareScript}`
    // Is the Action script unchanged from the existing local script?
    const oldScript     = deleteScriptHeaders(readFileSync(scriptPath) || '').replace(/\r\n/g, '\n')
    if (oldScript === bareScript.replace(/\n$/s, '')) {
        logResult(`Unchanged script - not saved:\t${scriptPath}`)
        return false
    }
    logResult(`Saving script:\t${scriptPath}`)
    if (options.fake) return
    fs.writeFileSync(scriptPath, newScript)
    return true
}

// Push an entire Button or Rule automation definition to the Workspace
async function updateAutomation( kind, automation ) {
    const {id}          = automation
    if ('enable' in options) {
        // Enable/disable the automation
        const e  = options.enable.toLowerCase()
        const tf =  (e==='1' || e==='y' || e==='yes' || e==='true'  ) ? true  :
                    (e==='0' || e==='n' || e==='no'  || e==='false' ) ? false :
            myAssert(false, `Invalid value for \`--enable\` option: "${options.enable}"`)
        automation.enabled = tf
    }
    return fiberyFetch(`/api/automations/${getAutomationKindSubpath(kind)}/${id}`, 'PUT', automation)
}

// Check the validity of an automation's definition
// Return the number of invalid actions found
function validateAutomation( dbName, automationKind, automation ) {
    function myWarn(...args) {
        console.warn(boldRed(stringify(...args)))
    }
    let problemActionsCnt   = 0, actionNum = 0
    const validActionParams = {
        'add-assignments'        : { args: {min: 1, max: 1, valid: ['items'            ] }},
        'add'                    : { args: {min: 1, max: 1, valid: ['fields'           ] }},
        'create'                 : { args: {min: 1, max: 1, valid: ['fields'           ] }},
        'delete'                 : { args: {min: 0, max: 2, valid: ['filter','fields'  ] }},
        'email-app-$-app-$-send' : { args: {min: 6, max: 6, valid: ['to','cc','bcc','subject','message','markdown'] }},
        'fibery-notify-users'    : { args: {min: 5, max: 5, valid: ['to','subject','message','notify_author','no_empty_send'] }},
        'fibery-notify'          : { args: {min: 3, max: 3, valid: ['subject','message','notify_author'] }},
        'link'                   : { args: {min: 1, max: 1, valid: ['items'            ] }},
        'overwrite-document'     : { args: {min: 1, max: 1, valid: ['value'            ] }},
        'prepend-document'       : { args: {min: 1, max: 1, valid: ['value'            ] }},
        'script'                 : { args: {min: 1, max: 1, valid: ['script'           ] }},
        'set-document'           : { args: {min: 1, max: 1, valid: ['value'            ] }},
        'unlink'                 : { args: {min: 0, max: 2, valid: ['filter','fields'  ] }},
        'update'                 : { args: {min: 1, max: 2, valid: ['filter','fields'  ] }},
        'watch'                  : { args: {min: 1, max: 1, valid: ['watchers'         ] }},
        'add-pdf'                : { args: {min: 2, max: 3, valid: ['fileName', 'template', 'treatAsHtml'] } },
    }
    for (const action of automation.actions) {
        ++actionNum
        const actionType        = action.action.replace(/-\w{8}-\w{4}-\w{4}-\w{4}-\w{12}(?:-.*)?$/, '')
        const title             = `[${dbName}] ${Capitalize(automationKind)} "${automation.name}" action #${actionNum} (${actionType})`
        const validParams       = validActionParams[actionType] ?? myAssert(false, `${title}: unknown actionType`)
        if (!action.args) {
            warn(`No action.args for ${title}`)
            continue
        }
        const actionArgsKeys    = Object.keys(action.args)
        const unexpectedKeys    = actionArgsKeys.filter( k => !validParams.args.valid.includes(k) )
        const actionArgsCount   = actionArgsKeys.length
        let   isaProblem        = false
        if (unexpectedKeys.length > 0) {
            myWarn(`${title}: args contains unexpected keys: ${unexpectedKeys.map(k=>`"${k}"`).join(', ')}`)
            isaProblem = true
        }
        if (actionArgsCount > validParams.args.max) {
            myWarn(`${title}: contains too many keys (${actionArgsCount}) - max=${validParams.args.max}`)
            isaProblem = true
        }
        else if (actionArgsCount < validParams.args.min) {
            myWarn(`${title}: contains too few keys (${actionArgsCount}) - min=${validParams.args.min}`)
            isaProblem = true
        }
        if (isaProblem) ++problemActionsCnt
    }
    return problemActionsCnt
}


//---------------------------------------------------------------------------------------------------
//  Iterate over all filtered automations and process them with the supplied callback
//
async function processFilteredAutomations( forceCache, processAutomation ) {
    await doSetup(forceCache)
    let spacesCnt=0, dbsCnt=0, automationsCnt=0, scriptActionsCnt=0, allActionsCnt=0
    for (const space of spaces_filtered()) {
        ++spacesCnt
        logVerbose( `Scanning Space:    \t${space.name}\t${space.id}` )
        for (const db of dbs_filtered(space)) {
            ++dbsCnt
            const dbId = db['fibery/id'], dbName = db['fibery/name'], dbDir = getDbDir(space, dbId)
            logVerbose(`Scanning   DB:    \t${dbName}\t${dbId}`)
            const buttons = buttons_filtered( await getDBAutomations('button', space, dbId, forceCache) )
            const rules   =   rules_filtered( await getDBAutomations('rule',   space, dbId, forceCache) )
            for (const [automationKind, automations] of [['button', buttons], ['rule', rules]]) {
                for (const automation of automations) {
                    ++automationsCnt
                    logVerbose(`Scanning     ${Capitalize(automationKind)}:  \t${automation.name}\t${automation.id}\t${isAutomationEnabled(automation) ? '{E}' : '{D}'}`)
                    const problemsCnt    = validateAutomation(dbName, automationKind, automation)      // Always validate
                    if (problemsCnt>0 && options['strict-validation']) continue
                    const scriptActions  = findScriptActions(automation.actions)
                    allActionsCnt       += automation.actions.length
                    const cnt = await processAutomation({space, spaceName: space.name, dbName, dbDir, automationKind, automation, scriptActions, problemsCnt})
                    scriptActionsCnt    += (typeof cnt==='number') ? cnt : scriptActions.length
                }
            }
        }
    }
    if      (spacesCnt        ==0) warn('No spaces were matched - check your `--space` filter.')
    else if (dbsCnt           ==0) warn('No DBs were matched - check your `--db` filter.' + (options.cache ? ' Maybe try it without `--cache`.':''))
    else if (automationsCnt   ==0) warn('No automations were matched - check your filters.')
    else if (scriptActionsCnt ==0) warn(`${automationsCnt} automations were matched, but no script actions were found.`)
    return  {spacesCnt, dbsCnt, automationsCnt, allActionsCnt, scriptActionsCnt}
}


//---------------------------------------------------------------------------------------------------
//  Validate: Check automation definitions
//
async function validate() {
    let totalProblemsCnt = 0
    const {automationsCnt, allActionsCnt} = await processFilteredAutomations( null,
        ({problemsCnt}) => totalProblemsCnt += problemsCnt )    // Automations validation is performed by processFilteredAutomations
    if (totalProblemsCnt > 0) appReturnCode = 3
    if (options.quiet)
        log(totalProblemsCnt)
    else {
        logResult(`Checked ${automationsCnt} automations and ${allActionsCnt} actions`)
        const msg = `${totalProblemsCnt} invalid actions found`
        log(totalProblemsCnt>0 ? boldRed(msg) : pc.reset(pc.green(msg)))
    }
}

//---------------------------------------------------------------------------------------------------
//  Pull: Get automation script definitions from the Fibery Workspace
//
async function pull() {
    const forceCache = false     // Disable caching when pulling automation scripts from Fibery, so we always get CURRENT automation definitions
    const {automationsCnt, scriptActionsCnt} = await processFilteredAutomations( forceCache,
        ({dbDir, automationKind, automation, scriptActions}) => {
            let cnt = 0
            for (const action of scriptActions)
                cnt += saveLocalActionScript(dbDir, automationKind, automation, action) ? 1:0
            // return cnt
        })
    if (options.quiet) log(scriptActionsCnt)
    else logResult(`${scriptActionsCnt} script actions ${options.fake ? 'found to save':'saved'} in ${automationsCnt} automations`)
}

//---------------------------------------------------------------------------------------------------
//  Push: Update Fibery Workspace actions from local automation script definitions
//
async function push() {
    // Always force a specific cache mode when scanning automations to push to Fibery:
    // If '--nofiles' is true, ALWAYS get old automations FROM CACHE so we will push entire historical automation definitions;
    // otherwise NEVER use cache, so we always get CURRENT automation definitions from Fibery, then only update their action scripts.
    const forceCache         = options.nofiles
    let totalActionsPushed   = 0
    const {automationsCnt} = await processFilteredAutomations( forceCache,
        async({dbName, dbDir, automationKind, automation, scriptActions, problemActionsCnt}) => {
            if (problemActionsCnt > 0) return (appReturnCode = 3)
            const scriptActionsCnt  = scriptActions.length
            let   missingActionsCnt = 0
            if (options.nofiles) {
                // When --nofiles is specified, push entire cached automation definitions, IGNORING LOCAL SCRIPT FILES
                if (scriptActionsCnt)
                    logResult(`Pushing cached ${Capitalize(automationKind)} definition:\t${automation.name}`)
            }
            else if (scriptActionsCnt > 0) {
                // Process each script action
                for (const action of scriptActions) {
                    const scriptPath = localActionScriptPath(dbDir, automationKind, automation.name, automation.id, action.id)
                    if (!doesPathExist(scriptPath)) {
                        warn(`Local script file not found: ${scriptPath}`)
                        ++missingActionsCnt
                        continue
                    }
                    // Process this script action
                    const apiHeader  = scriptIdHeader(automation.id, action.id)
                    const gitHeader  = scriptGitHeader(scriptPath)
                    includedFrom     = ''
                    const bareScript = deleteScriptHeaders( expandScript(scriptPath) )
                    const newScript  = `${apiHeader}${gitHeader}\n${bareScript}`    // Add headers to script
                    // const newScript  = macroSubstitutions(`${apiHeader}${gitHeader}\n${bareScript}`)    // Add headers to script and substitute macros
                    action.args.script.value = newScript
                    logResult(`Pushing action script:\t${scriptPath}`)
                    // The automation will get pushed after all actions have been processed (below)
                }
            }
            // The entire automation must be updated as one (API can't update individual actions)
            if (missingActionsCnt > 0) {
                // Don't update this automation
                warn(`No 'push' will be done for ${Capitalize(automationKind)} "${automation.name}"`)
                warn(`Use \`${appName} pull --noclobber ...\` to get missing action script definitions from Fibery.`)
                appReturnCode ||= 2
            } else if (scriptActionsCnt > 0) {
                // Update this automation
                await updateAutomation(automationKind, automation)
                totalActionsPushed += scriptActionsCnt
            }
            else
                logVerbose(`No actions found to update for [${dbName}] ${Capitalize(automationKind)} ${automation.name}`)
        })

    if (options.quiet)
        log(totalActionsPushed)
    else if (options.nofiles)
        logResult(options.fake ? `${automationsCnt} automations found to push` :
                                 `${automationsCnt} automations pushed`)
    else
        logResult(options.fake ? `${totalActionsPushed} actions found to push in ${automationsCnt} automations` :
                                 `${totalActionsPushed} actions pushed in ${automationsCnt} automations`)
}

//---------------------------------------------------------------------------------------------------
//  Purge: Trim older cache files
//
async function purge() {
    await doSetup()
    let purgedCount = 0, totalCount = 0

    // Process all cache files in dirPath
    function purgeCacheFiles( dirPath ) {
        for (const fileName of readdirSync(dirPath)) {
            ++totalCount
            const m         = fileName.match( /(?<year>\d\d\d\d)-(?<month>\d\d)-(?<day>\d\d) (?<hours>\d\d).(?<minutes>\d\d).(?<seconds>\d\d)\.(?<ms>\d+)\.jsonc$/ )
            if (!m) continue
            const {year, month, day, hours, minutes, seconds, ms} = m.groups
            const fileDate  = new Date()
            fileDate.setFullYear(year, month-1, day)
            fileDate.setHours(hours, minutes, seconds, ms)
            if (fileDate>cacheBefore || fileDate<cacheAfter) continue
            const filePath  = path.join(dirPath, fileName)
            logResult(`Deleting:\t${filePath}`)
            if (!options.fake) fs.unlinkSync(filePath)
            ++purgedCount
        }
    }

    // Purge cache files for schema and spaces
    const cacheDir = getSpaceDir(null)
    purgeCacheFiles( path.join(cacheDir, '.schema-cache') )
    purgeCacheFiles( path.join(cacheDir, '.spaces-cache') )

    // Purge automation cache files for each Space and DB
    for (const  space of spaces_filtered()) {
        for (const db of dbs_filtered(space)) {
            const dbDir = getDbDir(space, db['fibery/id'])
            purgeCacheFiles( path.join(dbDir, '.button-cache') )
            purgeCacheFiles( path.join(dbDir, '.rule-cache') )
        }
    }
    if (options.quiet)  log(purgedCount)
    else                logResult(`${purgedCount} cache files ≤ ${cacheBefore} ${options.fake ? 'found to purge':'purged'}, out of a total of ${totalCount} cache files`)
}

//---------------------------------------------------------------------------------------------------
//  Orphans: List local Spaces/DBs/Automations no longer existing in the Fibery Workspace
//
async function orphans() {
    myAssert(!options.button && !options.rule && options.db==='*', 'The `orphans` command does not use the `--db`, `--rule` or `--button` options.')
    await doSetup()

    const trailingDirSep = path.sep
    const filteredSpaces = Array.from( spaces_filtered() )
    let   totalOrphans   = 0, totalObjects = 0
    const spacesDir      = path.join( domainDir, 'fibery', 'space' )

    // Scan all space dirs in the Workspace
    for (const spaceName of readdirSync(spacesDir).filter(makeFilter(options.space))) {
        ++totalObjects
        const spacePath  = path.join(spacesDir, spaceName)
        const   spaceId  = getDirTokenId(spacePath, '.space')
        logVerbose(`Scanning Space:\t${spacePath}\t${spaceId}` )
        if (!spaceId) {
            warn(`Space dir does not have an Id - ignoring:\t${spacePath}`)
            ++totalOrphans
            continue
        }
        const space = filteredSpaces.find(s => s.id===spaceId)
        if (!space) {
            logResultRed(`Orphaned Space:\t${spacePath + trailingDirSep}`)
            ++totalOrphans
            continue
        }
        const dbs = Array.from(dbs_filtered(space))

        // Scan all DB dirs in the space dir
        const dbsPath     = path.join(spacePath, 'database')
        for (const dbDir of readdirSync(dbsPath).filter(dir => !dir.startsWith('.'))) {
            ++totalObjects
            const  dbPath = path.join(  dbsPath,  dbDir)
            const  dbId   = getDirTokenId(dbPath, '.db')
            logVerbose(`Scanning   DB:\t\t${dbPath}\t${dbId}`)
            if (!dbId) {
                warn(`DB dir does not have an Id - ignoring:\t${dbPath}`)
                ++totalOrphans
                continue
            }
            const db = dbs.find( d => d['fibery/id']===dbId )
            if (!db) {
                logResultRed(`Orphaned DB:\t${dbPath + trailingDirSep}`)
                ++totalOrphans
                continue
            }
            const buttons = Array.from( await getDBAutomations('button', space, dbId, false) )   // NOT filtered, possibly cached
            const rules   = Array.from( await getDBAutomations(  'rule', space, dbId, false) )   // NOT filtered, possibly cached

            // Scan all dirs and files in the DB dir for orphaned scripts
            for (const automationKind of ['button', 'rule']) {
                const  automationsDir = path.join(dbPath, 'automations', automationKind)
                for (const fileName of readdirSync(automationsDir)) {
                    ++totalObjects
                    const  filePath  = path.join(automationsDir, fileName)
                    if (fileName.startsWith('.')) continue          // Ignore cache dir/file
                    if (!fileName.match(/\.js$/i)) {
                        warn(`Unknown file, ignoring:\t"${filePath}"`)
                        continue
                    }
                    const [scriptId, actionId] = parseFileActionIds(filePath)
                    logVerbose(`Scanning     ${Capitalize(automationKind)}:  \t${fileName}\t${scriptId}\t${actionId}`)
                    if (!scriptId || !actionId) {
                        warn(`Did not find valid Id comment in script - ignoring:\t${filePath}`)
                        continue
                    }
                    const action = findActionInAutomations( automationKind==='button' ? buttons : rules, scriptId, actionId )
                    if (!action) {
                        ++totalOrphans
                        logResultRed(`Orphaned script:\t${filePath}`)
                    }
                }
            }
        }
    }

    if (options.quiet)  log(totalOrphans)
    else                logResult(`Found ${totalOrphans} orphaned objects of ${totalObjects} scanned`)
}

//---------------------------------------------------------------------------------------------------
//  Enable: enable/disable automations
//
async function enable() {
    assert('enable' in options, 'expecting `--enable` option')
    const e  = options.enable.toLowerCase()
    const tf = (e==='1' || e==='y' || e==='yes' || e==='true'  ) ? true  :
               (e==='0' || e==='n' || e==='no'  || e==='false' ) ? false :
               myAssert(false, `Invalid value for \`--enable\` option: "${options.enable}"`)
    const forceCache = null
    const {automationsCnt} = await processFilteredAutomations( forceCache,
        async({automationKind, automation}) => {
            // Enable/disable the automation
            const {id}      = automation
            const command   = {enabled: tf}
            await fiberyFetch(`/api/automations/${getAutomationKindSubpath(automationKind)}/${id}`, 'PUT', command)
    })
    const enable_disable = options.enable ? 'enable':'disable'
    if (options.quiet) log(automationsCnt)
    else logResult(`${automationsCnt} automations ${options.fake ? 'found to '+enable_disable : enable_disable+'d'}`)
}


//---------------------------------------------------------------------------------------------------
//  RunScript functionality
//
const enumIds_ = {}          // Lookup an enum Id from its enum-type and name

// Get an enum-field entry's Id from its type and entry-name
const getEnumId_fromName = async(enumType, enumName) => {
    if (!enumIds_[enumType]) {
        // Fetch all the enum entities and build the lookup
        // const spaceName     = enumType.replace(/\/.*/, '')
        const nameField     =  'enum/name' // `${spaceName}/Name`
        const command       = [{ command: 'fibery.entity/query', args: {
            query: {
                'q/from'    : enumType,
                'q/select'  : [ 'fibery/id', nameField ],     // 'q/select'  : [ 'fibery/id', { nameField: ['enum/name'] } ],
                'q/limit'   : 'q/no-limit',
            }
        } }]
        const data      = await fiberyFetch('/api/commands', 'post', command)
        // Build the lookup entries
        const entries   = {}
        for (const entity of data[0].result)
            entries[ entity[nameField] ] = entity['fibery/id']
        enumIds_[enumType] = entries
    }
    return enumIds_[enumType][enumName]
}

// Adjust a "front-end" entity's field names and entity refs for the backend API
async function adjustEntityForApi( type, entity ) {
    const spaceName         = type.replace(/\/.*/, '')
    const fiberyFields      =   {  // Translate "front-end/context.fibery" fibery field names to back-end API field names
        'id'                : 'fibery/id',
        'Id'                : 'fibery/id',
        'Public Id'         : 'fibery/public-id',
        'Rank'              : 'fibery/rank',
        'Created By'        : 'fibery/created-by',
        'Creation Date'     : 'fibery/creation-date',
        'Modification Date' : 'fibery/modification-date',
    }
    const translateFieldName = (fieldName) => fiberyFields[fieldName] ?? `${spaceName}/${fieldName}`
    
    // Add Space-name to field-names
    const addSpaceNameToFieldNames = (entity) =>
          entity instanceof Array  ? entity.map( (v) => addSpaceNameToFieldNames(v) )
        : entity instanceof Object ? Object.fromEntries(
            Object.entries(entity)
            .map( ([fieldName, val]) => [translateFieldName(fieldName), addSpaceNameToFieldNames(val)] ))
        : entity

    // Find a field def by name
    const getFieldDef = (fieldName) => schema.types[type]['fibery/fields'].find( (f) => f['fibery/name']===fieldName )

    // Is fieldDef an enum (single/multi select)?
    const isEnumField = (fieldDef) => fieldDef['fibery/meta']['fibery/type-component?'] === true

    // Is fieldDef a relation?
    const isRelationField = (fieldDef) => fieldDef['fibery/meta']['fibery/relation']

    // Lookup the Id of a particular enum-field entry from its Name
    const getEnumValueId = async(fieldDef, name) => await getEnumId_fromName(fieldDef['fibery/type'], name)

    // Adjust fields for back-end API use
    const fixupFields = async(entity) => {
        const result = {}
        for (let [fieldName, val] of Object.entries(entity)) {
            const fieldDef = getFieldDef(fieldName)
            if (isEnumField(fieldDef))              // Replace enum-field values (names) with their corresponding enum-Id
                val = { 'fibery/id': await getEnumValueId(fieldDef, val) }
            else if (isRelationField(fieldDef) && typeof val==='string')
                val = { 'fibery/id': val }          // Fixup a bare relation Id
            result[fieldName] = val
        }
        return result
    }

    //-------------------------------------------//
    entity = addSpaceNameToFieldNames(entity)
    return await fixupFields(entity)
}

async function adjustEntitiesForApi( type, entities ) {
    const result = []
    for (const entity of entities)
        result.push( await adjustEntityForApi(type, entity) )
    return result
}

// Simulate Fibery's script environment for running scripts locally
const context = {
    getService( name ) {
        if (name==='fibery')
            return context.fibery
        else
            throw Error(`Unsupported: context.getService("${name}")`)
    },

    fibery: {

        async executeSingleCommand( body ) {
            dbg('context.fibery.executeSingleCommand:', body)
            await waitIfNice()
            const isArrayBody = body instanceof Array
            if (!isArrayBody)   body = [body]
            const data      = await fiberyFetch( '/api/commands', 'post', body )
            const message   = data?.reduce( (acc, result, i) => acc +
                (result?.success===false ? `[${i}]: ${result.message}\n` : ''), '' )
            if (message) {
                debugBreak()
                error('fibery Entity API errors: '+message)
            }
            return isArrayBody ? data : data[0].result
        },

        async createEntityBatch( type, entities ) {
            dbg(`context.fibery.createEntityBatch: ${type} (${entities.length})`)
            assert(entities instanceof Array)
            await waitIfNice()
            const body = (await adjustEntitiesForApi(type, entities))
                .map( (entity) => ({
                    command : "fibery.entity/create",
                    args    : {type, entity}
                }) )
            return context.fibery.executeSingleCommand(body)
        },

        async createEntity( type, entity ) {
            dbg(`context.fibery.createEntity: ${type}`)
            assert(entity instanceof Object)
            await waitIfNice()
            entity = await adjustEntityForApi(type, entity)
            const body = {
                command : "fibery.entity/create",
                args    : {type, entity}
            }
            return context.fibery.executeSingleCommand(body)
        },

        async deleteEntityBatch( type, ids ) {
            dbg(`context.fibery.deleteEntityBatch: ${type} (${ids.length})`)
            assert(ids instanceof Array)
            await waitIfNice()
            const body = ids.map( (id) => ({
                    command : "fibery.entity/delete",
                    args    : {type, entity:{'fibery/id': id} }
                }) )
            return context.fibery.executeSingleCommand(body)
        },

        async deleteEntity( type, id ) {
            dbg(`context.fibery.createEntity: ${type}`)
            assert(entity instanceof Object)
            await waitIfNice()
            const body = {
                command : "fibery.entity/delete",
                args    : {type, entity:{'fibery/id': id} }
        }
            return context.fibery.executeSingleCommand(body)
        },

        async updateEntity( type, id, entity ) {
            dbg(`context.fibery.updateEntity: ${type} ${id}`)
            assert(entity instanceof Object)
            await waitIfNice()
            entity = await adjustEntityForApi(type, {...entity, id})
            const body = {
                command : "fibery.entity/update",
                args    : {type, entity}
            }
            return context.fibery.executeSingleCommand(body)
        },

        async updateEntityBatch( type, entities ) {
            dbg(`context.fibery.updateEntityBatch: ${type} (${entities.length})`)
            assert(entities instanceof Array)
            await waitIfNice()
            const body = (await adjustEntitiesForApi(type, entities))
                .map( (entity) => ({
                    command : "fibery.entity/update",
                    args    : {type, entity}
                }) )
            return context.fibery.executeSingleCommand(body)
        },

        //TODO: implement the remaining Fibery script API functions:
        //  getEntityById(type: string, id: string, fields: string[])
        //  getEntitiesByIds(type: string, ids: string[], fields: string[])
        //  addCollectionItem(type: string, id: string, field: string, itemId: string)
        //  addCollectionItemBatch(type: string, field: string, args: {id: string, itemId: string}[])
        //  removeCollectionItem(type: string, id: string, field: string, itemId: string)
        //  removeCollectionItemBatch(type: string, field: string, args: {id: string, itemId: string}[])
        //  setState(type: string, id: string, state: string)
        //  setStateToFinal(type: string, id: string)
        //  assignUser(type: string, id: string, userId: string)
        //  unassignUser(type: string, id: string, userId: string)
        //  getDocumentContent(secret: string, format: string)
        //  setDocumentContent(secret: string, content: string, format: string)
        //  appendDocumentContent(secret: string, content: string, format: string)
        //  addComment(type: string, id: string, comment: string, authorId: string, format: string)
        //  addFileFromUrl(url: string, fileName: string, type: string, id: string, headers: object)
        //  executeAction(action: string, type: string, args: [object])
        //  graphql(spacename: string, command: string)
        //  getSchema()
    },

    localRun: true
}

// Get a count of total Workspace-calculations queue depth
async function fiberyWorkspaceQueues() {
    let   total = 0
    const queryAddrs = ['/api/formulas/status', '/api/entity-relation-linker/status', '/api/automation-rules/status'] // '/api/search-message-handlers/status']
    for (const addr of queryAddrs) {
        const result = await fiberyFetch(addr, 'get')
        total += result?.queueSize
        await delay(350)
    }
    return total
}

// Wait for Fibery work queues to clear
async function waitIfNice( delayMs=60000 ) {
    while (options.nice) {
        const queueLen  = await fiberyWorkspaceQueues()
        if (queueLen < 1) break
        log(`Waiting for Fibery queues (nice): ${queueLen}`)
        await delay(delayMs)
    }
}

//---------------------------------------------------------------------------------------------------
//  RunScript: run a Fibery automation script locally
//
async function runScript() {
    const forceCache = options.forceCache

    // How many actions are matched?
    const {automationsCnt, scriptActionsCnt} = await processFilteredAutomations( forceCache, ()=>null )
    myAssert(automationsCnt===1, `Error: matched ${automationsCnt} automations (must match exacly 1)`)
    await processFilteredAutomations( forceCache,
        async({spaceName, dbName, dbDir, automationKind, automation, scriptActions, problemActionsCnt}) => {
            if (problemActionsCnt > 0) return (appReturnCode = 3)
        const scriptActionsCnt  = scriptActions.length
        let   missingActionsCnt = 0
        if (scriptActionsCnt > 0) {
            // Process each matched script action
            for (const action of scriptActions) {
                const scriptPath = localActionScriptPath(dbDir, automationKind, automation.name, automation.id, action.id)
                if (!doesPathExist(scriptPath)) {
                    warn(`Local script file not found: ${scriptPath}`)
                    ++missingActionsCnt
                    continue
                }
                if (options.fake) {
                    logResult(`Would run action script:\t${scriptPath}`)
                    continue
                }
                // Process this script action
                stopSpinner()
                useSpinner = false
                logResult(`Running action script:\t${scriptPath}`)
                includedFrom    = ''
                const script    = expandScript(scriptPath)
                // executeScript({dbName, spaceName, script: bareScript, fetch: fiberyFetch})
                // async function executeScript({dbName, spaceName, script}) {
                // Make a fake 'args' global for the target script, like what it expects in its normal environment (defines the proper DB Type)
                const args = {
                    currentUser:     null,
                    currentEntities: [ {Type: dbName} ]
                }
                await waitIfNice()
                let f, res
                try {
                    eval( `f = async()=>{ ${script} ; }` )
                    res = await f()
                } catch (err) {
                    debugger
                    error(err.message)
                }
                log(`Script returned: ${res}`)
            }
        }
        else {
            logVerbose(`No actions found for [${dbName}] ${Capitalize(automationKind)} ${automation.name}`)
            return (appReturnCode = 3)
        }
    })

    if (!options.quiet) logResult(`${scriptActionsCnt} script actions ${options.fake ? 'found to execute':'executed'}`)
}


//---------------------------------------------------------------------------------------------------
//  MAIN
//
async function main() {
    parseCommandLineOptions()
    dbg(`${appName} ${positionals.join(' ')}\t${JSON.stringify(options)}`)
    command = positionals.shift()?.toLowerCase()
    if (options.help || command==='help') {
        help(positionals.shift())
        return
    }
    const haveWorkToDo = command || 'enable' in options
    if (options.url) {
        myAssert(command?.match(/pull|push|run|validate/) || (!command && 'enable' in options), 'The `--url` option is only valid with the `pull` or `push` or `validate` or `run` commands')
        myAssert(!options.space && !options.db && !options.button && !options.rule && !options.path, `The following options are incompatible with \`--url\`:  --space, --db, --button, --rule, --path`)
        urlFilter.fields = options.url.match( /^https?:\/\/(?<domain>[^'"/:]+\.fibery\.io)(?<port>:\d+)?\/fibery\/space\/(?<space>[^/]+)\/database\/(?<db>[^/]+)\/automations\/(?<kind>rule|button)\/(?<id>\w+)(?:\/actions\/?|\/activity\/?)?$/ )?.groups
        myAssert(urlFilter?.fields, `\`--url\` value is not a valid Fibery automation URL: ${options.url}`)
    }
    else if (options.path) {
        myAssert(command?.match(/pull|push|run|validate/) || (!command && 'enable' in options), 'The `--path` option is only valid with the `pull` or `push` or `validate` or `run` commands')
        myAssert(!options.space && !options.db && !options.button && !options.rule && !options.url, 'The following options are incompatible with `--path`:  --space, --db, --button, --rule, --url')
        myAssert(options.path.endsWith('.js') && doesPathExist(options.path), '`--path` value must be a .js script file')
        pathFilter.fields = options.path.match(/[/\\]space[/\\](?<spaceName>[^/\\]+)[/\\]database[/\\](?<dbName>[^/\\]+)[/\\]automations[/\\](?<kind>rule|button)[/\\](?<name>[^/\\]+) ~(?<id>[0-9a-f]{4})\.js/)?.groups
        assert( hasAllFieldValues(pathFilter.fields, ['spaceName', 'dbName', 'kind', 'name', 'id']), `'--path' value does not have the expected structure: ${options.path}`)
    }
    else if (command?.match(/pull|push|run|validate/))
                            myAssert(options.url||options.button||options.rule, `You must specify the \`--button\` or \`--rule\` name filter (or both), or the \`--url\` option, with the \`${command}\` command.`)
    if (command!=='help')   myAssert( positionals.length===0, `Unexpected command line arguments: ${positionals.join(' ')}`)
    if (command!=='push')   myAssert(!options.nofiles,       '`--nofiles` option can only be used with the `push` command')
    if (command!=='pull')   myAssert(!options.noclobber,     '`--noclobber` option can only be used with the `pull` command')
    if (options.nofiles)    myAssert( options.cache,         '`--nofiles` is only valid with the `--cache` option')
    if (haveWorkToDo && useSpinner) {
        stopSpinner()
        spinner.start()
    }

    options.space   ??= '*'     // default: match all Spaces
    options.db      ??= '*'     // default: match all DBs

    switch ( options.validate ? '' : (command ?? '') )
    {
        case 'pull':
            await pull()
            break
        case 'push':
            await push()
            break
        case 'purge':
            myAssert( options.before, `\`${command}\` requires the \`--before\` option to specify the cutoff date (cache files older than this will be deleted).`)
            if (!(options.button||options.rule)) warn(`Warning: specify the \`--button=/\` and \`--rule=/\` options if you want to purge their cache files.`)
            await purge()
            break
        case 'orphans':
            await orphans()
            break
        case 'validate':
            await validate()
            break
        case 'run':
            await runScript()
            break
        case '':
            if (options.validate)
                warn(`${appName} ${positionals.join(' ')}\t${JSON.stringify(options)}\n` +
                    `FIBERY:\t${process.env['FIBERY']}\nFIBERY_DOMAIN:\t${process.env['FIBERY_DOMAIN']}\nFIBERY_API_KEY:\t${process.env['FIBERY_API_KEY']}`)
            if ('enable' in options)
                await enable()
            else
                help()
            appReturnCode = process.env['FIBERY'] && process.env['FIBERY_DOMAIN'] && process.env['FIBERY_API_KEY'] ? 0:1
            break
        default:
            myAssert(false, `Unrecognized command "${command}"`)
            help()
            appReturnCode = 1
            break
    }
}

main()
    .catch((err) => error(err))
    .finally(()  => { stopSpinner(); process.exit(appReturnCode) })