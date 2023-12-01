#!/usr/bin/env node
// fibscripts.js - Manage Fibery Automation Scripts Remotely
//---------------------------------------------------------------------------------------------------

import   childProcess    from 'node:child_process'
import   assert          from 'node:assert/strict'
import   path            from 'node:path'
import   fs              from 'node:fs'
import { parseArgs     } from 'node:util'
import { oraPromise    } from 'ora'                     // Console "busy" spinner
import   pc              from 'picocolors'              // Console colors

//---------------------------------------------------------------------------------------------------
//  Global vars

const thisScriptName    = path.basename( process.argv[1] ).replace(/\.[^.]+$/, '')    // Name of this program file without file extension
let   options, positionals, FIBERY, FIBERY_DOMAIN
let   domainDir                                         // Dir where everything for the Fibery workspace is stored
let   workspace, schema, spaces
let   cacheAfter, cacheBefore
let   returnCode        = 0                             // Program return code
let   debug             = false
const warned            = {}                            // Don't repeat identical warnings

//---------------------------------------------------------------------------------------------------
//  Helper functions

const {log}             = console
const dbg               = (...args) => { if (debug) console.debug(pc.white(pc.dim(...args))) }
const debugBreak        = () => { if (debug) debugger }
function timestamp()    { return new Date(...arguments).toLocaleString('sv', {year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric', second:'numeric', fractionalSecondDigits: 3}).replace(',', '.') }
const startTimestamp    = timestamp()

function error(...args) {
    const err = args[0]
    if (err?.stdout?.toString) err.stdout = err.stdout.toString()
    if (err?.stderr?.toString) err.stderr = err.stderr.toString()
    console.error(`${thisScriptName}:`, ...args)
    debugBreak()
    process.exit(returnCode || 1)
}
const warn              = (...args)             => { const msg=args[0]; if (!warned[msg]) {warned[msg]=1; console.warn(pc.yellow(...args))} }
const logResult         = (...args)             => { if (!options.quiet  ) log(pc.green  (...args)) }
const logVerbose        = (...args)             => { if ( options.verbose) log(pc.magenta(...args)) }
const myAssert          = (condition, msg)      => { if (!condition) error(msg) }       // When we don't want a stack trace

const isaDirectory      = (path)                => { try { return fs.lstatSync(path).isDirectory() } catch(err) { return null } }
const doesPathExist     = (fpath)               => { try { return fs.statSync(fpath)               } catch(err) { return null } }
const doesDirContain    = (dirPath, fileName)   => doesPathExist(path.join(dirPath, fileName))
const joinNonBlank      = (delimiter, ...args)  => args?.filter( (arg) => arg!=null && arg!='' )?.join(delimiter)

//---------------------------------------------------------------------------------------------------
// Setup

const commandLineOptions = {
    workspace:     { type: 'string',   short: 'w',                 },
    space:         { type: 'string',   short: 's',  default: '*'   },   // default: match all Spaces
    db:            { type: 'string',   short: 'd',  default: '*'   },   // default: match all DBs
    button:        { type: 'string',   short: 'b',  default: ''    },   // default: match  no Buttons
    rule:          { type: 'string',   short: 'r',  default: ''    },   // default: match  no Rules
    cache:         { type: 'boolean',  short: 'c',  default: false },
    nogit:         { type: 'boolean',  short: 'g',  default: false },
    fake:          { type: 'boolean',  short: 'f',  default: false },
    verbose:       { type: 'boolean',  short: 'v',  default: false },
    debug:         { type: 'boolean',  short: 'u',  default: false },
    quiet:         { type: 'boolean',  short: 'q',  default: false },
    yes:           { type: 'boolean',  short: 'y',  default: false },
    nofiles:       { type: 'boolean',               default: false },
    validate:      { type: 'boolean',               default: false },
    before:        { type: 'string',                               },
    after:         { type: 'string',                               },
}

// Parse command line options
function parseCommandLineOptions() {
    const {values, positionals: pos} = parseArgs({ args: process.argv.slice(2), options: commandLineOptions, allowPositionals: true })
    options             = values
    positionals         = pos ?? []
    debug               = debug || options.debug
    if (debug)  options.verbose = true
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
    } else {
        cacheAfter = new Date(0)                                // The distant past
    }

    await getSpaces(forceCache)
    await getSchema(forceCache)
}

function help( cmd ) {
    switch (cmd || '') {

        case '':
            log(`
${thisScriptName} - Manage Fibery automation scripts locally

Usage:  ${thisScriptName}  { pull | push | purge | orphans | help {cmd} }  [ options... ]

COMMANDS:

    help [cmd]            Show help, optionally for a specific program command
    pull                  Download and save Fibery workspace Button and Rule Javascript actions
    push                  Push local Javascript Button and Rule actions back to Fibery workspace
    purge --before {date} Delete cache entries older than the specified cutoff date
    orphans               List orphaned local files and dirs that were deleted in Fibery

OPTIONS: (can appear anywhere on the command line)

    --workspace   -w      The Fibery workspace domain, e.g. "my.fibery.io" - or, the full path to the local workspace dir
    --space       -s      Space   name filter
    --db          -d      DB      name filter
    --button      -b      Button  name filter
    --rule        -r      Rule    name filter
    --cache       -c      Use existing cached Space/DB info instead getting it from Fibery
    --nogit       -g      Don't try to use git (when your local script files are not tracked in git)
    --nofiles             Ignore local script files; use with \`push\` to restore automations from cache files
    --yes         -y      Create/rename local files/directories as needed for pull operations
    --fake        -f      Dry run - don't actually update or overwrite anything
    --verbose     -v      Verbose output
    --debug       -u      Debug output
    --quiet       -q      Disable progress messages and spinners; only output a terse summary
    --before {date-time}  End of range for cache files (matches before OR EQUAL)
    --after  {date-time}  Start of range for cache files

ENVIRONMENT VARIABLES:

    FIBERY                Base path containing dirs for each Fibery workspace domain you manage
    FIBERY_DOMAIN         The Fibery workspace domain to manage (or specify this with the --workspace option)
    FIBERY_API_KEY        API key for the Fibery workspace domain - get it from "Fibery Settings > API Keys"

BASIC OPERATION

    The Fibery workspace domain to manage (e.g. "my.fibery.io") is specified by the FIBERY_DOMAIN env var or the \`--workspace option\`. It also defines the directory name under $FIBERY where the hierarchy of Fibery scripts for the workspace will be stored.

    If FIBERY_DOMAIN is just the domain (e.g. "my.fibery.io") then the FIBERY env var specifies the parent directory (e.g. "/home/me/fibery/") for workspace directory(ies).

    FIBERY_DOMAIN can alternatively specify the full path to the workspace directory (e.g. "/home/me/fibery/my.fibery.io"), in which case the FIBERY env var is ignored.

    Use \`${thisScriptName} pull\` to pull automation scripts from a Fibery workspace and store them in local *.js files under a directory hierarchy that mirrors the workspace's Spaces and DBs.

    Use \`${thisScriptName} push\` to push local *.js script files back to the Fibery workspace. Comments are inserted at the top of each script for identification and git info.

    The options \`--space\` \`--db\` \`--button\` and \`--rule\` define name filters to determine which Fibery elements will be processed by a command.

FILTERS:

    Filters are used to define the scope of a program operation by defining which Spaces/DBs/Buttons/Rules will be affected.

    Filters are glob-like by default, or regex if preceded by '/' (trailing slash is not required). Any filter is negated if the first character is '!'. Filters are always case-insensitive.

    If no filter is specified for a Space/DB, ALL Spaces/DBs will be processed.

    If no filter is specified for a Button/Rule, NONE will be processed. So you must specify either the \`--button\` or \`--rule\` filter (or both) in order for any automations to be processed.

    Maximum of one filter can be defined per category (Space/DB/Button/Rule). All supplied filters must match an item for it to be processed.

DIRECTORY STRUCTURE

    ${thisScriptName} stores the data pulled from a Fibery Workspace in a hierarchy of local folders. These directories are automatically created as needed if the \`--yes\` option is specified. If \`--yes\` is not specified an error is generated for a missing directory.

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
    
    A relative path is interpreted relative to the directory of the file currently being processed; that could be a macro file in the case of one macro file including another.

    Immediately after the inserted macro content the program will add a corresponding macro-end comment line of the form:
        //-include <path>

    When adding a macro-inclusion comment in a script file, you do not need to incude the corresponding macro-end comment line; the program will insert it.

    When a local script file is \`pushed\` to Fibery, each macro block within a source file (i.e. the lines between \`//+include\` and \`//-include\`, if present) is replaced with the current content of the referenced macro file.
    
    When pulling script files from Fibery, any macro content and comments will be left untouched, so after a \`pull\` operation your local script files will reflect what is actually on the server. But each time a local script file gets \`pushed\` back to your Fibery workspace, all its macro blocks will first be replaced by the current macro files' content.

EXAMPLES

    ${thisScriptName}  pull -b/ -r/                             # Pull ALL local Button and Rule scripts from Fibery, overwriting local script files
    ${thisScriptName}  push -r/ -b/                             # Push ALL local Button and Rule scripts to Fibery, overwriting current Workspace scripts
    ${thisScriptName}  pull --space=test\* -b/                  # Pull Button scripts only from Spaces beginning with "test"
    ${thisScriptName}  pull --space='!/^test|^foo' -r/          # Pull Rule scripts only from Fibery Spaces NOT beginning with "test" or "foo"
    ${thisScriptName}  pull --rule='/test|foo'                  # Pull Rule scripts from all Rules with names containing "test" or "foo"
    ${thisScriptName}  push --space='test*' -b/                 # Push all Button scripts in Spaces beginning with "test"
    ${thisScriptName}  push --db=bar -b'/test|foo'              # Push Button scripts for Buttons containing "test" or "Foo" in the Bar DB of any Space
    ${thisScriptName}  push --nofiles --before 2023-01-30 -b/   # Push cached Button definitions from latest cache files ≤ 2023-01-30
    ${thisScriptName}  purge --before 2023-01-30                # Delete local cache files created ≤ 2023-01-30
    ${thisScriptName}  orphans                                  # Find all "orphaned" local files and dirs that no longer correspond to the Fibery Workspace
`)
            break

        case 'pull':
            log(`
${thisScriptName} pull
    Download and save Fibery workspace Button and Rule Javascript actions. This will OVERWRITE existing local script files, so you make sure you've committed any local changes before doing a pull.

    Use the filter options to limit what Spaces/DBs/Buttons/Rules will be retrieved:
        --space       -s    Space   name filter
        --db          -d    DB      name filter
        --button      -b    Button  name filter
        --rule        -r    Rule    name filter
`)
            break

        case 'push':
            log(`
${thisScriptName} push
    Push local Javascript Button and Rule actions back to Fibery workspace. This will OVERWRITE Fibery script actions, so make sure the curent Workspace scripts are backed up. A \`pull --fake\` command (without \`--cache\`) will download the current Workspace scripts to local cache; \`--fake\` prevents overwriting your lcoal script files.

    If the \`--nofiles\` option is specified, local Button and Rule script source files will be ignored, and their cached definitions will be pushed instead. In this case not only the actions will be pushed but also the complete cached automation definitions. This allows restoring complete Button/Rule definitions from old cached versions.

    Use the filter options to limit what Spaces/DBs/Buttons/Rules will be updated:
        --space       -s    Space   name filter
        --db          -d    DB      name filter
        --button      -b    Button  name filter
        --rule        -r    Rule    name filter
`)
            break

        case 'purge':
            log(`
${thisScriptName} purge --before {date-time}
    Purge local cache entries that were created on or before the specified cutoff date-time.

    Older cache files are not automatically deleted. Use \`purge\` with \`--before\` to trim them.

    Use the filter options to limit what Spaces/DBs/Buttons/Rules will be affected:
        --space       -s    Space   name filter
        --db          -d    DB      name filter
`)
            break

        case 'orphans':
            log(`
${thisScriptName} orphans
    Search for "orphaned" local files and dirs that no longer correspond to the Fibery Workspace.

    You can use these filter options to limit which local Space/DB dirs will be checked:
        --space       -s    Space   name filter
        --db          -d    DB      name filter
`)
            break

        default:
            error(`Unrecognized command "${cmd}"`)
    }
    returnCode = 1
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
    if (body) payload.body = typeof body==='string' ? body : JSON.stringify(body)
    dbg(`fiberyFetch:\t${method} ${url}\t${JSON.stringify(payload)}`)
    try {
        if (options.fake && method==='PUT') return null
        const spinnerMsg = options.verbose ? `${method} ${url}` : ''
        response = await (options.quiet ? fetch(url, payload) : oraPromise( fetch(url, payload), {suffixText: spinnerMsg} ))
        if (response?.status==200) return response.json()
        error(`${response?.status}: ${response?.statusText}\n${url}`)
    } catch (err) {
        error(`${joinNonBlank('\n', err?.cause, response?.status, response?.statusText, err?.message)}\n${url}`)
    }
}

// Class to represent user-defined Spaces and Types in a Fibery Workspace
class FiberyWorkspaceSchema {
    constructor( schemaRaw ) {
        this.types = Object.fromEntries(
            schemaRaw['fibery/types']
            .filter( t => !( t['fibery/deleted?'] ||
                             t['fibery/meta']?.['fibery/enum?'] ||
                             t['fibery/name'].match(/^[a-z]|^Collaboration~Documents\/|^Files\/Files-mixin/) ))
            .map(    t =>  [ t['fibery/name'], t ] ) )
        this.spaces = {}
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
        if (result.stdout) result = result.stdout
        return result.toString()
    }
    catch (err) {
        err.stderr  = err.stderr?.toString()
        err.message = err?.output
            ?.map(    o => o?.toString())
            ?.filter( o => o!=null && o!='' )
            ?.join('\n')
        return err
    }
}

// Execute a git command synchronously
const execGitCommandSync = ( gitArgs, execOptions ) => execFileSync('git', gitArgs, execOptions)

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
        if (!options.yes) error(`Missing ${type} dir "${dir}" - Use the \`--yes\` option to create missing directories automatically`)
        warn(`Creating ${type} dir:\t${dir}`)
        if (!options.fake) fs.mkdirSync(dir, {recursive: true})
    }
    if (tokenFile) {
        // Create the dir's token file (to identify the dir by its Fibery id)
        const tokenPath = path.join(dir, tokenFile)
        if (!doesPathExist(tokenPath) && !options.fake) fs.writeFileSync(tokenPath, '')
    }
    return dir
}

// Check whether a file/dir should be renamed, and maybe rename it.
// When a local file/dir is found via its Fibery id, but it has a different name than what's in Fibery,
// then we want to rename it to keep the local file name in sync with its Fibery name.
function maybeRenameExisting( typeDescription, existingPath, idealPath ) {
    if (!existingPath || existingPath===idealPath) return idealPath
    if (!options.yes) {
        warn(`${typeDescription} directory "${existingPath}" should be renamed to "${idealPath}" - Use the \`--yes\` option to rename automatically`)
        return existingPath
    }
    warn(`Rename: ${typeDescription}\t"${existingPath}"\t"${idealPath}"`)
    if (options.fake ) return existingPath
    if (!options.nogit) {
        // Try renaming with `git mv`
        const gitmv = execGitCommandSync(['mv', existingPath, idealPath], {cwd: workspace})
        if (gitmv==='')
            return idealPath                    // Success
        else if (!gitmv?.message?.match('not under version control')) {
            warn('git mv: ' + gitmv.message)    // git error
            return existingPath
        }
        else {
            debugBreak()    // What?
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

// Find an existing script file by its identifying header comment line containing its Fibery Id
function find_scriptFile_byHeader( dbDir, idealFilePath, header ) {
    // Test the ideal filePath first
    if (testFileContentMatch(idealFilePath, header))
        return idealFilePath
    // Look for a script file in the dbDir that contains the specified header line
    const ext = path.extname(idealFilePath)                     // Extension including the '.'
    return readdirSync(dbDir)?.find(
        fname => fname.endsWith(ext) && testFileContentMatch( path.join(dbDir, fname), header )
    )
}

// Find a subdir that comtains the specified token file
function findSubdirByTokenFile(parentDir, tokenFile) {
    const found = readdirSync(parentDir)?.find(
        subdir => doesDirContain( path.join(parentDir, subdir), tokenFile ))
    return found ? path.join(parentDir, found) : null
}

// Get the local dir for a Space
function getSpaceDir( space=null ) {
    if (!space) return path.join(domainDir, 'fibery')
    const tokenFile     = tokenFileName('space', space.id)                      // Identifies a Space by its Id
    const idealDir      = path.join(domainDir, 'fibery', 'space', space.name)   // This is what the dirName should be
    const foundDir      = findSubdirByTokenFile(domainDir, tokenFile)
    if (  foundDir) return maybeRenameExisting('space', foundDir, idealDir)
    return maybeCreateDir('space', idealDir, tokenFile)
}

// Get the local dir for a DB by its Id
function getDbDir( space, dbId ) {
    const spaceDir      = getSpaceDir(space)
    if (!dbId) return spaceDir                                                  // Space dir not specific to any DB
    const dbName        = dbName_from_dbId(dbId)  
    const tokenFile     = tokenFileName('db', dbId)                             // Identifies a DB by its Id
    const idealDir      = path.join(spaceDir, 'database', dbName )              // This is what the dirName should be
    const foundDir      = findSubdirByTokenFile(spaceDir, tokenFile)
    if (  foundDir ) return maybeRenameExisting('DB', foundDir, idealDir)
    return maybeCreateDir('DB', idealDir, tokenFile)
}

//---------------------------------------------------------------------------------------------------
//  Cache functions
//

// Get the cache dir for a DB and cacheType
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

// Get a cached or fresh API object
async function cachify( space, dbId, cacheType, forceCache, creatorFunc ) {
    const cacheDir      = getCacheDir(space, dbId, cacheType)
    if (forceCache==null) forceCache = options.cache        // default: false
    if (forceCache) {
        // Get cached data if available
        const cacheFile = selectCacheFile(cacheDir)
        if (cacheFile) {
            const cachePath = path.join(cacheDir, cacheFile)
            dbg(`reading cache:\t${cachePath}`)
            let content = readFileSync(cachePath)
            while (!content.match(/^\s*[[{}]/))             // Delete any cruft/comments before start of JSON
                content = content.replace(/.*[\r\n]*/, '')
            const obj   = JSON.parse(content)
            return obj
        } else if (cacheType.match(/button|rule/i)) {
            if (options.nofiles) myAssert(false, `A cache file must be used with the \`--nofiles\` option, but none was found for "${cacheDir}" - check your \`--before\` and \`--after\` options.`)
        }
    }

    // Get fresh data
    const obj = await creatorFunc()
    // Write the fresh data to a new cache entry
    const timestamp     = startTimestamp.replace(/[:;\\<>|]/g, '_')     // Windows can't handle these in filenames
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
        myAssert(data?.[0]?.success, `Error retrieving schema for ${FIBERY_DOMAIN} - check your FIBERY_API_KEY?`)
        return data
    })
    schema = new FiberyWorkspaceSchema( data[0].result )
}

// Get the list of Spaces in the Fibery workspace
async function getSpaces( forceCache=null ) {
    spaces = await cachify(null, null, 'spaces', forceCache, async() => {
        const data = await fiberyFetch('/api/commands?reason=preload&command=fibery.app/get-available-apps', 'POST', '[{"command":"fibery.app/get-available-apps","args":{}}]')
        myAssert(data?.length > 0, `Could not read spaces for ${FIBERY_DOMAIN} - check your FIBERY_API_KEY env var`)
        const result = {}
        for (const space of data[0].result) {
            const name = space['app-namespace']
            if (!name.match(/^[a-z]|^Collaboration~Documents$|^Files$/)) {
                const id = space['app-id']
                result[name] = {name, id}
            }
        }
        myAssert(Object.keys(result)?.length > 0, `Did not fetch any user Fibery Spaces from Workspace "${FIBERY_DOMAIN}"`)
        return result
    })
}

// Create a filter function for the names of Rules/Buttons/Spaces/Types
function makeFilter( pattern, field='name' ) {
    if (!pattern)                       return () => false      // Matches nothing
    if (pattern==='*' || pattern==='/') return () => true       // Matches everything
    const negate        = pattern.startsWith('!')               // Start a pattern with '!' to negate it
    if (negate) pattern = pattern.substr(1)
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

// Generate all Spaces that pass the Space name filter
function* spaces_filtered() {
    yield* Object.values(spaces)
        .filter( makeFilter(options.space) )
        .sort( (a,b) => a.name.localeCompare(b.name) )
}

// Generate all Types in the given space that pass the DB name filter
function* dbs_filtered( space ) {
    if (!space?.types) return            // This Space has NO types/DBs defined
    yield* Object.values(space.types)
        .filter( makeFilter(options.db) )
        .sort( (a,b) => a['fibery/name'].localeCompare(b['fibery/name']) )
}

// Generate all Buttons that pass the Button name filter
function* buttons_filtered( buttons ) {
    if (!buttons) return
    yield* buttons
        .filter( makeFilter(options.button) )
        .sort( (a,b) => a.name.localeCompare(b.name) )
}

// Generate all Rules that pass the Rules name filter
function* rules_filtered( rules ) {
    if (!rules) return
    yield* rules
        .filter( makeFilter(options.rule) )
        .sort( (a,b) => a.name.localeCompare(b.name) )
}

// Return the Fibery URL subpath for button/rule
const getAutomationKindSubpath = (kind) =>
    kind.match( /rule/i   ) ? 'auto-rules' :
    kind.match( /button/i ) ? 'buttons'    :
    assert.ok( false )

// Get all Button/Rule definitions for a DB
async function getAutomationsForType( kind, space, dbId, forceCache=null ) {
    const kindPath  = getAutomationKindSubpath(kind)
    const result    = await cachify(space, dbId, kind, forceCache,
        async() => fiberyFetch(`/api/automations/${kindPath}/for-type/${dbId}`, 'GET'))
    assert.ok(result instanceof Array)
    return result
}

// Generate a script's Id comment line
const scriptIdHeader = ( automationId, actionId ) => `//.fibery AUTOID=${automationId} ACTIONID=${actionId}\n`

// Generate a script's git header block comment
function scriptGitHeader( filePath ) {
    if (options.nogit) return ''
    const cwd   = path.dirname(filePath), filename = path.basename(filePath)
    let gitlog  = execGitCommandSync(['log', '--decorate', '-n1', '--', filename], {cwd})
    if (gitlog.stderr) {
        warn(gitlog.stderr.toString())
        return ''
    }
    gitlog      = gitlog.toString()
    if (!gitlog) return ''
    // Return a C-style comment block containing the git log info
    return '/*.git\n'
        + gitlog.split('\n').map( line => '** '+line ).join('\n')
        + '\n*/\n'
}

// Remove all script headers from a script
const deleteScriptHeaders = (script) => script.replace(/\/\/.fibery\s+.*[\r\n]+/, '')
                                              .replace(/\/\*.git\b[\s\S]*?\*\/\s*[\r\n]+/, '')

// Get a script file's content, expanding any macros
function expandScript( scriptPath ) {
    const script            = readFileSync(scriptPath)
    myAssert(script!=null, `Script not found: ${scriptPath}`)
    const lines             = script.split(/\r\n|\r|\n/)
    let   result            = ''
    // Process each script line
    for (let lineNo=0; lineNo<lines.length; lineNo++) {
        if (!lines[lineNo].startsWith('//+include ')) {
            result          += (result ? '\n':'') + lines[lineNo]
            continue
        }
        // Found a macro-start comment line
        const macroStart    = lines[lineNo]
        const macroEnd      = macroStart.replace('//+', '//-')                          // comment line that marks the macro end
        let   macroPath     = macroStart.match( /\s+(.*)/ )?.[1]
                            ?.trim()?.replace(/^(["'])(.*)\1$/, "$2")                   // strip quotes surrounding the macro path
        myAssert(macroPath, `Missing macro path on line ${lineNo} of ${scriptPath}`)
        macroPath           = fixPathSeparators( macroPath.replace(/^@/, domainDir) )   // Substitute leading "@" with domainDir
        if (macroPath.startsWith('..'))                                                 // Interpret relative path relative to scriptPath
            macroPath       = path.normalize(path.join(path.dirname(scriptPath), macroPath))
        const macroContent  = expandScript(macroPath)
        result              += (result ? '\n':'') + `${macroStart}\n${macroContent}\n${macroEnd}\n`
        // Skip over old macro content up to the macro-end line
        const macroEndLineNo = lines.findIndex( (line) => line===macroEnd )
        if (macroEndLineNo > -1) lineNo = macroEndLineNo
    }
    return result
}

// Get Space/DB Id from directory token file
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

// Find a Button/Rule action in automations by its Ids
function findActionInAutomations( automations, scriptId, actionId ) {
    const auto   =    automations.find( a => a.id===scriptId )
    const action = auto?.actions?.find( a => a.id===actionId )
    return action
}

// Find the local *.js script file for an action
function localActionScriptPath( dbDir, automationKind, automationName, automationId, actionId ) {
    const idHeader      = scriptIdHeader(automationId, actionId)
    const scriptAction  = actionId.slice(-4)                                // Differentiates multiple scripts in the same Automation
    const fileName      = `${automationName} ~${scriptAction}.js`           // This is what the script filename should be
    const dir           = path.join(dbDir, 'automations', automationKind.toLowerCase())
    const idealFile     = path.join(dir, fileName)
    maybeCreateDir(automationKind, dir)
    const existingFile  = find_scriptFile_byHeader(dir, idealFile, idHeader)
    return maybeRenameExisting('script', existingFile, idealFile)
}

// Save an automation action script locally
function saveLocalActionScript( dbDir, automationKind, automation, action ) {
    const script     = action.args.script.value
    const scriptPath = localActionScriptPath(dbDir, automationKind, automation.name, automation.id, action.id)
    logResult(`Saving script:\t${scriptPath}`)
    const apiHeader  = scriptIdHeader(automation.id, action.id)
    const bareScript = deleteScriptHeaders(script)
    const newScript  = `${apiHeader}\n${bareScript}`
    if (options.fake) return
    fs.writeFileSync(scriptPath, newScript)
}

// Push an entire Button or Rule automation definition to the Workspace
async function updateAutomation( kind, automation ) {
    const {id}      = automation
    const kindPath  = getAutomationKindSubpath(kind)
    return fiberyFetch(`/api/automations/${kindPath}/${id}`, 'PUT', automation)
}

//---------------------------------------------------------------------------------------------------
//  Pull: Get automation script definitions from the Fibery Workspace
//
async function pull() {
    await doSetup()
    let spacesCount=0, typesCount=0, automationsCount=0, actionsCount=0
    for (const space of spaces_filtered()) {
        ++spacesCount
        logVerbose( `Scanning Space:    \t${space.name}\t${space.id}` )

        for (const type of dbs_filtered(space)) {
            ++typesCount
            const dbId = type['fibery/id'], dbName = type['fibery/name'], dbDir = getDbDir(space, dbId)
            logVerbose(`Scanning DB:    \t${dbName}\t${dbId}`)

            // Get automation actions for Buttons or Rules from Fibery
            function processAutomations( automationKind, automations ) {
                for (const automation of automations) {
                    ++automationsCount
                    logVerbose(`Scanning ${automationKind}:  \t${automation.name}\t${automation.id}`)
                    // Check each action for a script
                    for (const action of automation.actions) {
                        if (action.args?.script) {
                            ++actionsCount
                            saveLocalActionScript(dbDir, automationKind, automation, action)
                        }
                    }
                }
            }

            processAutomations( 'button', buttons_filtered( await getAutomationsForType('button', space, dbId, false) ))  // no cache
            processAutomations( 'rule',     rules_filtered( await getAutomationsForType('rule',   space, dbId, false) ))  // no cache
        }
    }

    if      (spacesCount     ==0)   warn('No spaces were matched - check your `--space` filter.')
    else if (typesCount      ==0)   warn('No DBs were matched - check your `--db` filter.' + (options.cache ? ' Maybe try it without `--cache`.':''))
    else if (automationsCount==0)   warn('No automations were matched - check your filters.')
    else if (actionsCount    ==0)   warn(`${automationsCount} automations were matched, but no script actions were found.`)
    else if (options.quiet)         log(actionsCount)
    else                            logResult(`${actionsCount} actions ${options.fake ? 'found to save':'saved'}`)
}

//---------------------------------------------------------------------------------------------------
//  Push: Get automation script definitions from Fibery Workspace
//
async function push() {
    await doSetup()
    // Process all matching Spaces
    let spacesCount=0, typesCount=0, automationsCount=0, actionsCount=0
    for (const space of spaces_filtered(workspace)) {
        ++spacesCount
        logVerbose(    `Scanning Space:\t${space.name}\t${space.id}` )

        // Process all matching Types
        for (const type of dbs_filtered(space)) {
            ++typesCount
            logVerbose(`Scanning DB:\t${type['fibery/name']}\t${type['fibery/id']}`)
            const dbId  = type['fibery/id']
            const dbDir = await getDbDir(space, dbId)

            // Update automation actions for Buttons or Rules
            async function updateActions( automationKind, automations ) {
                ++automationsCount
                // Check each automation (Button/Rule) in this DB
                for (const automation of automations) {
                    ++automationsCount
                    logVerbose(`Scanning ${automationKind}:\t${automation.name}\t${automation.id}`)
                    let dirtyCount = 0                                      // How many actions found to update in current automation?
                    if (options.nofiles) {
                        // When --nofiles is specified, push entire cached automation definitions, IGNORING LOCAL SCRIPT FILES
                        ++dirtyCount
                        actionsCount += automation.actions.length
                        logResult(`Pushing cached ${automationKind}:\t${automation.name}`)
                    }
                    else {
                        // Check each action in the automation
                        for (const action of automation.actions) {
                            if (!action?.args?.script) continue             // Ignore this action: not a script
                            const scriptPath = localActionScriptPath(dbDir, automationKind, automation.name, automation.id, action.id)
                            if (!doesPathExist(scriptPath)) {
                                warn(`Local script file not found: ${scriptPath}} -- use \`${thisScriptName} pull\` to get current script definitions from Fibery`)
                                warn(`No 'push' will be done for ${automationKind} "${automation.name}"`)
                                returnCode  = 1
                                dirtyCount  = 0                             // Don't update any actions in this automation
                                break
                            }
                            ++actionsCount
                            const apiHeader  = scriptIdHeader(automation.id, action.id)
                            const gitHeader  = scriptGitHeader(scriptPath)
                            const bareScript = deleteScriptHeaders( expandScript(scriptPath) )
                            const newScript  = `${apiHeader}${gitHeader}\n${bareScript}`    // Add headers to script
                            logResult(`Pushing script:\t${scriptPath}`)
                            action.args.script.value = newScript            // Update the automation action from the local script
                            ++dirtyCount
                        }
                    }
                    if (dirtyCount>0) {
                        // Update the entire automation to Fibery
                        await updateAutomation(automationKind, automation)
                    } else {
                        logResult(`No actions to update for ${automationKind} [${space.name}/${type.name}] ${automation.name}`)
                    }
                }
            }

            // Always force cache usage when scanning automations to update:
            // If '--nofiles' is true, ALWAYS get old automations FROM CACHE so we will push entire historical automation definitions;
            // otherwise NEVER use cache, so we always get the CURRENT automation defs from Fibery and only update their action scripts.
            const forceCache = options.nofiles
            await updateActions('Button', buttons_filtered( await getAutomationsForType('button', space, dbId, forceCache) ))
            await updateActions('Rule',     rules_filtered( await getAutomationsForType('rule',   space, dbId, forceCache) ))
        }
    }

    if      (spacesCount     ==0)   warn('No spaces were matched - check your `--space` filter.')
    else if (typesCount      ==0)   warn('No DBs were matched - check your `--db` filter.' + (options.cache ? ' Maybe try it without `--cache`.':''))
    else if (automationsCount==0)   warn('No automations were matched - check your filters.')
    else if (actionsCount    ==0)   warn(`${automationsCount} automations were matched, but no script actions were found.`)
    else if (options.quiet)         log(actionsCount)
    else                            logResult(`${actionsCount} actions ${options.fake ? 'found to push':'updated'}`)
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

    // Purge cache for schema and spaces
    const cacheDir = getSpaceDir(null)
    purgeCacheFiles( path.join(cacheDir, '.schema-cache') )
    purgeCacheFiles( path.join(cacheDir, '.spaces-cache') )

    // Purge automation caches for each Space and DB
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
    myAssert(!options.button && !options.rule, 'The `orphans` command does not use the `--rule` or `--button` options.')
    await doSetup()

    const trailingDirSep = path.sep
    const filteredSpaces = Array.from( spaces_filtered() )
    let   totalOrphans   = 0, totalObjects = 0
    const spacesDir      = path.join( domainDir, 'fibery', 'space' )

    // Scan all Space dirs in Workspace
    for (const spaceName of readdirSync(spacesDir).filter(dir => !dir.startsWith('.'))) {
        ++totalObjects
        const spacePath  = path.join(spacesDir, spaceName)
        const   spaceId  = getDirTokenId(spacePath, '.space')
        if (!spaceId) {
            warn(`Space dir does not have an Id - ignoring:\t${spacePath}`)
            ++totalOrphans
            continue
        }
        const space = filteredSpaces.find(s => s.id===spaceId)
        if (!space) {
            logResult(`Orphaned Space:\t${spacePath + trailingDirSep}`)
            ++totalOrphans
            continue
        }
        const dbs = Array.from(dbs_filtered(space))

        // Scan all DBs in the Space
        const dbsPath     = path.join(spacePath, 'database')
        for (const dbDir of readdirSync(dbsPath).filter(dir => !dir.startsWith('.'))) {
            ++totalObjects
            const  dbPath = path.join(  dbsPath,  dbDir)
            const  dbId   = getDirTokenId(dbPath, '.db')
            if (!dbId) {
                warn(`DB dir does not have an Id - ignoring:\t${dbPath}`)
                ++totalOrphans
                continue
            }
            const db = dbs.find( d => d['fibery/id']===dbId )
            if (!db) {
                logResult(`Orphaned DB:\t${dbPath + trailingDirSep}`)
                ++totalOrphans
                continue
            }
            const buttons = Array.from( await getAutomationsForType('button', space, dbId, false) )   // NOT filtered, possibly cached
            const rules   = Array.from( await getAutomationsForType(  'rule', space, dbId, false) )   // NOT filtered, possibly cached

            // Scan all files in DB dirs for orphaned scripts
            for (const kind of ['button', 'rule']) {
                const automationsDir = path.join(dbPath, 'automations', kind)
                for (const fileName of readdirSync(automationsDir)) {
                    ++totalObjects
                    const  filePath  = path.join(automationsDir, fileName)
                    if (fileName.startsWith('.')) continue          // Ignore cache dir/file
                    if (!fileName.match(/\.js$/i)) {
                        warn(`Unexpected filename - ignoring:\t"${filePath}"`)
                        continue
                    }
                    const [scriptId, actionId] = parseFileActionIds(filePath)
                    if (!scriptId || !actionId) {
                        warn(`Did not find valid Id comment in script - ignoring:\t${filePath}`)
                        continue
                    }
                    const action = findActionInAutomations( kind==='button' ? buttons : rules, scriptId, actionId )
                    if (!action) {
                        ++totalOrphans
                        logResult(`Orphaned script:\t${filePath}`)
                    }
                }
            }
        }
    }

    if (options.quiet)  log(totalOrphans)
    else                logResult(`Found ${totalOrphans} orphaned objects of ${totalObjects} total objects`)
}


//---------------------------------------------------------------------------------------------------
//  MAIN
//
async function main() {
    parseCommandLineOptions()
    dbg(`${thisScriptName} ${positionals.join(' ')}\t${JSON.stringify(options)}`)
    let cmd = positionals.shift()?.toLowerCase()
    if (cmd?.match(/pull|push/))    myAssert(options.button||options.rule, `You must specify the \`--button\` or \`--rule\` name filter (or both) for any automations to be processed by the \`${cmd}\` command.`)
    if (cmd!=='help')               myAssert(positionals.length===0, `Unexpected command line arguments: ${positionals.join(' ')}`)
    if (cmd!=='push')               myAssert(!options.nofiles,       '`--nofiles` option can only be used with the `push` command')
    if (options.nofiles)            myAssert(options.cache,          '`--nofiles` requires specifying the `--cache` option')

    switch (cmd || '')
    {
        case 'pull':
            await pull()
            break
            
        case 'push':
            await push()
            break
            
        case 'purge':
            myAssert( options.before, `\`${cmd}\` requires the \`--before\` option to specify the cutoff date (cache files older than this will be deleted).`)
            if (!(options.button||options.rule)) warn(`Warning: specify \`--button=/\` and \`--rule=/\` options if you want to purge their cache files.`)
            await purge()
            break
                
        case 'orphans':
            await orphans()
            break

        case '':
            if (options.validate) {
                const apiKey = process.env['FIBERY_API_KEY']?.replace(/./g, '*') ?? 'undefined'
                warn(`FIBERY:\t${process.env['FIBERY']}\nFIBERY_DOMAIN:\t${process.env['FIBERY_DOMAIN']}\nFIBERY_API_KEY:\t${apiKey}`)
            } else
                help()
            returnCode = process.env['FIBERY'] && process.env['FIBERY_DOMAIN'] && process.env['FIBERY_API_KEY'] ? 0:1
            break

        case 'help':
            help( positionals.shift() )
            break

        default:
            myAssert(false, `Unrecognized command "${cmd}"`)
            help()
            returnCode = 1
            break
    }
}

main()
    .catch((err) => error(err) )
    .finally( () => process.exit(returnCode) )