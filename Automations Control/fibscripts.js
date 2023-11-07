#!/usr/bin/env node
// fibscripts.js - Manage Fibery Automation Scripts Remotely
//---------------------------------------------------------------------------------------------------
//TODO:

import   childProcess    from 'node:child_process'
import   assert          from 'node:assert/strict'
import   path            from 'node:path'
import   fs              from 'node:fs'
import { parseArgs     } from 'node:util'
import { oraPromise    } from 'ora'                     // Console "busy" spinner

//---------------------------------------------------------------------------------------------------
// Globals

const thisScriptName    = path.basename( process.argv[1] ).replace(/\.[^.]+$/, '')    // Name of this program file without file extension
let   options, positionals, FIBERY, FIBERY_DOMAIN
let   domainDir                                         // Dir where everything for the Fibery workspace is stored
let   workspace, schema, spaces
let   cacheAfter, cacheBefore
let   returnCode        = 0                             // Program return code
let   debug             = false

//---------------------------------------------------------------------------------------------------
// Functions

const {log}             = console
const dbg               = (...args) => { if (debug) log('-', ...args) }
const debugBreak        = () => { if (debug) debugger }
function timestamp()    { return new Date(...arguments).toLocaleString('sv', {year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric', second:'numeric', fractionalSecondDigits: 3}).replace(',', '.') }
const startTimestamp    = timestamp()
const warned            = {}                    // Don't repeat identical warnings

function error(...args) {
    const err = args[0]
    if (err.stdout) err.stdout = err.stdout.toString()
    if (err.stderr) err.stderr = err.stderr.toString()
    console.error(`${thisScriptName}: `, ...args)
    debugBreak()
    process.exit(returnCode || 1)
}
const warn              = (...args)             => { const msg = args[0]; if (!warned[msg]) {warned[msg]=1; console.warn(...args)} }
const myAssert          = (condition, msg)      => { if (!condition) error(msg) }       // When we don't want a stack trace
const isaDirectory      = (path)                => { try { return fs.lstatSync(path).isDirectory() } catch(err) { return null } }
const doesPathExist     = (fpath)               => { try { return fs.statSync(fpath)               } catch(err) { return null } }
const doesDirContain    = (dirPath, fileName)   => doesPathExist(path.join(dirPath, fileName))

//---------------------------------------------------------------------------------------------------
// Setup

const commandLineOptions = {
    workspace:     { type: 'string',   short: 'w',                 },
    space:         { type: 'string',   short: 's',  default: '*'   },   // default: match all Spaces
    db:            { type: 'string',   short: 'd',  default: '*'   },   // default: match all DBs
    button:        { type: 'string',   short: 'b',  default: ''    },   // default: match no Buttons
    rule:          { type: 'string',   short: 'r',  default: ''    },   // default: match no Rules
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
    if (options.workspace) process.env.FIBERY_DOMAIN = options.workspace            // --workspace option overrides FIBERY_DOMAIN env var
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
        cacheBefore.setFullYear(1 + cacheBefore.getFullYear())    // one year in the future
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
    purge --before {date} Delete cache entries older than the specified cutoff
    orphans               List orphaned local files and dirs that were deleted in Fibery

OPTIONS: (can appear anywhere on the command line)

    --workspace   -w      The Fiberyworkspace domain, e.g. "my.fibery.io" - or the full path to the local workspace dir
    --space       -s      Space   name filter
    --db          -d      DB      name filter
    --button      -b      Button  name filter
    --rule        -r      Rule    name filter
    --cache       -c      Use existing cached Space/DB info instead getting it from Fibery
    --nogit       -g      Don't try to use git (for when your local script files are not tracked in git)
    --yes         -y      Create local storage directories as needed
    --fake        -f      Dry run - don't actually update or overwrite anything
    --verbose     -v      Verbose output
    --quiet       -q      Disable progress messages and spinners
    --debug       -u      Debug output
    --nofiles             Ignore local script files, only use cache content (use with \`push\`)
    --before {date-time}  High cutoff date-time for cache files (matches before OR EQUAL)
    --after  {date-time}  Low cutoff date-time for cache files

ENVIRONMENT VARIABLES:

    FIBERY                Base path containing dirs for each Fibery workspace domain you manage
    FIBERY_DOMAIN         The Fibery workspace domain to manage (or specify this with the --workspace option)
    FIBERY_API_KEY        API key for the Fibery workspace domain - get it from "Fibery Settings > API Keys"

BASIC OPERATION

    The Fibery workspace domain to manage (e.g. "my.fibery.io") is specified by the FIBERY_DOMAIN env var or the \`--workspace option\`. It also defines the directory name under $FIBERY where the hierarchy of Fibery scripts for the workspace will be stored.

    If FIBERY_DOMAIN is just the domain (e.g. "my.fibery.io") then the FIBERY env var specifies the parent directory (e.g. "/home/me/fibery/") for workspace directory(ies).

    FIBERY_DOMAIN can alternatively specify the full path to the workspace directory (e.g. "/home/me/fibery/my.fibery.io"), in which case the FIBERY env var is ignored.

    Run \`${thisScriptName} pull\` to pull automation scripts from a Fibery workspace and store them in local *.js files under a directory hierarchy that mirrors the workspace's Spaces and DBs.

    Run \`${thisScriptName} push\` to push local *.js script files back to the Fibery workspace. Comments are inserted at the top of each script for identification and git info.

    The options \`--space\` \`--db\` \`--button\` and \`--rule\` define name filters to limit which Fibery elements will be processed by a push/pull/purge command.

FILTERS:

    Filters are used to define the scope of a program operation to certain Spaces/DBs/Buttons/Rules.

    Filters are glob-like by default, or regex if preceded by '/' (trailing slash not required). Any filter is negated if the first character is '!'. Filters are always case-insensitive.

    If no filter is specified for a Space/DB, all Spaces/DBs will be processed.

    If no filter is specified for a Button/Rule, NONE will be processed. So you must specify either the \`--button\` or \`--rule\` filter (or both) in order for any automations to be processed.

    Only one filter can be defined for each category. All supplied filters must match an item for it to be processed.

DIRECTORY STRUCTURE

    ${thisScriptName} stores the data pulled from a Fibery Workspace in a hierarchy of local folders. These directories are automatically created as needed if the \`--yes\` option is specified. If \`--yes\` is not specified an error is generated for a missing directory.

    The base directory containing all Fibery workspaces is defined by the FIBERY env var (though it can also be specified in FIBERY_DOMAIN). In the main FIBERY directory are directories for each specific Fibery workspace. The workspace to use must be specified via the FIBERY_DOMAIN env var or the \`--workspace\` option; e.g. \`--workspace=mydomain.fibery.io\`.

    Within a workspace directory are directories for each Space, named \`SPACE~ {space-name}\`, and under those are directories for each DB, named \`DB~ {DB-name}\`.

    Each script action in a Button/Rule automation will be stored in its respective DB~ directory, named either \`BUTTON~ {Button-name} ~{id}.js\` or \`RULE~ {Rule-name} ~{id}.js\`. The 'id' in the name is used to correlate each script to a specific action with the automation (because there can be more than one script action within an automation).

    The program will detect when a Space/DB/Automation has been renamed in Fibery, and if the \`--yes\` option is active the program will try to rename the local file/directory to match the new Fibery name using \`git mv\` (unless \`--nogit\` is specified, in which case the directory is renamed with the default OS function).

    Some cache directories and housekeeping files are also created throughout the file hierarchy; their names always begin with a period.

CACHING

    The result of every Fibery API query that returns part of the Workspace is stored in a local cache files that begins with a period. These cached results can be reused instead of re-querying Fibery API by specifying the \`--cache\` option. This can save time especially if you have many Spaces and DB's and automations.

    These cache files also serve as backups, since they contain the complete definitions of all automations pulled from Fibery.

    Old cache files are not automatically deleted; Use the \`purge\` program command to trim them.

    When the \`--cache\` option is specified, the most recent cache files will normally be used, but the \`--before\` and \`--after\` options can be used to specify which cache files will be used. It is always the date encoded in a cache file name that determines the file's nominal date for comparing with \`--before\` and \`--after\`.

EXAMPLES

    ${thisScriptName}  pull -b/ -r/                 # Pulls ALL action scripts from Fibery, overwriting local script files
    ${thisScriptName}  pull --space=test\*          # Pulls action scripts only from Spaces beginning with "test"
    ${thisScriptName}  pull --space='!/^test|^foo'  # Pulls action scripts only from Spaces NOT beginning with "test" or "foo"
    ${thisScriptName}  pull --rule='/test|foo'      # Pulls action scripts from Rules beginning with "test"
    ${thisScriptName}  push                         # Pushes ALL local script actions to Fibery, overwriting existing Workspace scripts
    ${thisScriptName}  push --space='test*'         # Pushes local script actions for Spaces beginning with "test", overwriting existing Workspace scripts
    ${thisScriptName}  push --button='/test|foo'    # Pushes local script actions for Buttons containing "test" or "Foo" AND all Rules, overwriting existing Workspace scripts
    ${thisScriptName}  push --before 2023-01-30 --nofiles -b/   # Pushes old Buttons definitions from latest cache files ≤ 2023-01-30
    ${thisScriptName}  purge --before 2023-01-30    # Deletes local API cache files created ≤ 2023-01-30
    ${thisScriptName}  orphans                      # Find all "orphaned" local files and dirs that no longer correspond to the Fibery Workspace
`)
            break

        case 'pull':
            log(`
${thisScriptName} pull
    Download and save Fibery workspace Button and Rule Javascript actions. This will OVERWRITE existing local script files, so you make sure you've committed any local changes before doing a pull.

    Use the name filter options to limit what Spaces/DBs/Buttons/Rules will be retrieved:
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

    Use the name filter options to limit what Spaces/DBs/Buttons/Rules will be updated:
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

    Use the name filter options to limit what Spaces/DBs/Buttons/Rules will be affected:
        --space       -s    Space   name filter
        --db          -d    DB      name filter
`)
            break

        case 'orphans':
            log(`
${thisScriptName} orphans
    Search for "orphaned" local files and dirs that no longer correspond to the Fibery Workspace.

    You can use these filter options to limit which local Spaces/DB dirs will be checked:
        --space       -s    Space   name filter
        --db          -d    DB      name filter
`)
            break

        default:
            error(`Unrecognized command "${cmd}"`)
    }
    returnCode = 1
}

// Join all nonblank args with a delimiter
const joinNonBlank = (delimiter, ...args) => args?.filter( arg => arg!=null && arg!='' )?.join(delimiter)

// Make a Fibery API call
async function fiberyFetch( address, method, body=null ) {
    let   response
    const url       = `https://${FIBERY_DOMAIN}${address}`
    const payload   = {
        method,
        headers: {
            'Content-Type':  'application/json; charset=utf-8',
            'Authorization': `Token ${process.env.FIBERY_API_KEY}`,
    }}
    if (body) payload.body = typeof body==='string' ? body : JSON.stringify(body)
    dbg(`fiberyFetch:        \t${method} ${url} \t${JSON.stringify(payload)}`)
    try {
        if (options.fake && method==='PUT') return null
        const spinnerMsg = options.verbose ? `${method} ${url}` : ''
        response  = await (options.quiet ? fetch(url, payload) : oraPromise( fetch(url, payload), {suffixText: spinnerMsg} ))
        // response = await fetch(url, payload)
        if (response?.status==200) return response.json()
        error(`${response?.status}: ${response?.statusText}\n${url}`)
    } catch (err) {
        error(`${joinNonBlank('\n', err?.cause, response?.status, response?.statusText, err?.message)}\n${url}`)
    }
}

// Class to represent user-defined Spaces and Types in a Fibery Workspace
class FiberyWorkspaceSchema {
    constructor( schemaRaw ) {
    this.types = Object.fromEntries( schemaRaw['fibery/types']
            .filter( t => !( t['fibery/deleted?'] ||
                             t['fibery/meta']?.['fibery/enum?'] ||
                             t['fibery/name'].match(/^[a-z]|^Collaboration~Documents\/|^Files\/Files-mixin/) ))
            .map(    t =>   [t['fibery/name'], t] ) )
        this.spaces         = {}
        for (const [typeName, type] of Object.entries(this.types)) {
            const  [,sName, tName]  = typeName.match( /(.*)\/(.*)/ )
            type.name               = tName
            type.space              = sName
            this.spaces[sName]    ??= { name: sName, types: {} }
            this.spaces[sName].types[typeName] = type
            spaces[sName].types   ??= this.spaces[sName].types
        }
    }
}

const typeName_from_typeId      = (typeId)    => Object.values(schema.types).find( t => t['fibery/id']===typeId )?.name
// const spaceId_from_spaceName    = (spaceName) => spaces[spaceName].id


//---------------------------------------------------------------------------------------------------
// File & Process functions
//

// Readdir (sync, no exceptions thrown)
function readdirSync( dir ) {
    try { return fs.readdirSync(dir) }
    catch(err) { return [] }
}

// Readfile (sync, no exceptions thrown)
function readFileSync( dir ) {
    try { return fs.readFileSync(dir).toString() }
    catch(err) { return null }
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
        warn(`Creating ${type} dir: \t${dir}`)
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
    warn(`Rename:\t${typeDescription}     \t"${existingPath}" \t"${idealPath}"`)
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
function find_scriptFile_byHeader( typeDir, idealFilePath, header ) {
    // Test the ideal filePath first
    if (testFileContentMatch(idealFilePath, header))
        return idealFilePath
    // Look for a script file in the typeDir that contains the specified header line
    const ext = path.extname(idealFilePath)                     // Extension including the '.'
    return readdirSync(typeDir).find(
        fname => fname.endsWith(ext) && testFileContentMatch( path.join(typeDir, fname), header )
    )
}

// Find the local *.js script file for an action
function localActionScriptPath( typeDir, automationKind, automationName, automationId, actionId ) {
    const idHeader      = scriptIdHeader(automationId, actionId)
    const scriptAction  = actionId.slice(-4)                                // Differentiates multiple scripts in the same Automation
    const fileName      = `${automationKind.toUpperCase()}~ ${automationName} ~${scriptAction}.js`   // This is what the script filename should be
    const idealFile     = path.join(typeDir, fileName)
    const existingFile  = find_scriptFile_byHeader(typeDir, idealFile, idHeader)
    return maybeRenameExisting('script', existingFile, idealFile)
}

// Find a subdir that comtains the specified token file
function findSubdirByTokenFile(parentDir, tokenFile) {
    const found = readdirSync(parentDir).find(
        subdir => doesDirContain( path.join(parentDir, subdir), tokenFile ))
    return found ? path.join(parentDir, found) : null
}

// Get the local dir for a Space
function getSpaceDir( space=null ) {
    if (!space) return path.join(domainDir, '.fibery')                      // The cache dir not specific to any Space
    const tokenFile     = tokenFileName('space', space.id)                  // Identifies a Space by its Id
    const idealDir      = path.join(domainDir, `SPACE~ ${space.name}`)      // This is what the dirName should be
    const foundDir      = findSubdirByTokenFile(domainDir, tokenFile)
    if (  foundDir) return maybeRenameExisting('space', foundDir, idealDir)
    return maybeCreateDir('space', idealDir, tokenFile)
}

// Get the local dir for the given Type
function getTypeDir( space, typeId ) {
    const spaceDir      = getSpaceDir(space)
    if (!typeId) return spaceDir                                            // dir not specific to any Type
    const typeName      = typeName_from_typeId(typeId)
    const tokenFile     = tokenFileName('db', typeId)                       // Identifies a Type by its Id
    const idealDir      = path.join(spaceDir, `DB~ ${typeName}`)            // This is what the dirName should be
    const foundDir      = findSubdirByTokenFile(spaceDir, tokenFile)
    if (  foundDir ) return maybeRenameExisting('DB', foundDir, idealDir)
    return maybeCreateDir('DB', idealDir, tokenFile)
}

//---------------------------------------------------------------------------------------------------
// Cache functions
//

// Get the cache dir for a Type and cacheType
function getCacheDir( space, typeId, cacheType ) {
    const dir = path.join(getTypeDir(space, typeId), `.${cacheType}`)
    return maybeCreateDir(cacheType, dir)
}

// Select the most recent cache file in cacheDir created in the period between cacheAfter and cacheBefore
function selectCacheFile( cacheDir ) {
    // Cache filenames are a munged timestamp of their program start time (colons=>underscores) 
    const file = readdirSync(cacheDir)
        .sort( (a,b) => -a.localeCompare(b) )               // Sort descending - most recent first
        .find( (name) => {
            const m = name.match(/^(\d\d\d\d-\d\d-\d\d \d\d_\d\d_\d\d\.\d+)\.jsonc$/)
            if (!m) return false
            const date = new Date( m[1].replace(/_/g, ':') )
            if (isNaN(date)) return false
            return date>cacheAfter && date<=cacheBefore
        })
    return file
}

// Get a cached or fresh object
async function cachify( space, typeId, cacheType, forceCache, creatorFunc ) {
    const cacheDir      = getCacheDir(space, typeId, cacheType)
    if (forceCache==null) forceCache = options.cache        // default: false
    if (forceCache) {
        // Use cached data if available
        const cacheFile = selectCacheFile(cacheDir)
        if (cacheFile) {
            const cachePath = path.join(cacheDir, cacheFile)
            dbg(`reading  cache:   \t${cachePath}`)
            let content = readFileSync(cachePath)
            while (!content.match(/^\s*[[{}]/))             // Delete any cruft/comments before start of JSON
                content = content.replace(/.*[\r\n]*/, '')
            const obj   = JSON.parse(content)
            return obj
        } else if (cacheType.match(/buttons|rules/i)) {
            if (options.nofiles) myAssert(false, `A cache file must be used with the \`--nofiles\` option, but none was found for "${cacheDir}" - check your \`--before\` and \`--after\` options.`)
        }
    }
    // Get fresh data
    const obj = await creatorFunc()
    // Write the fresh data to a new cache entry
    const timestamp     = startTimestamp.replace(/[:;\\<>|]/g, '_')     // Windows can't handle these in filenames
    const cachePath     = path.join(cacheDir, `${timestamp}.jsonc`)
    const content       = `//# ${cachePath}\n` + JSON.stringify(obj)
    dbg(`saving   cache:    \t${cachePath}`)
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

// Create a filter function for names of Rules/Buttons/Spaces/Types
function makeFilter( pattern, field='name' ) {
    if (!pattern)                       return () => false      // Matches nothing
    if (pattern==='*' || pattern==='/') return () => true       // Matches everything
    const negate        = pattern.startsWith('!')               // Start a pattern with '!' to negate it
    if (negate) pattern = pattern.substr(1)
    const makeReFilter  = (pat, field, negate) => {
        const re        = new RegExp(pat, 'i')
        return (obj) => {
             const n = !re.exec(typeof obj==='string' ? obj : obj[field])
             return negate ? n : !n
        }
    }
    return pattern.startsWith('/') ?
        makeReFilter( pattern.substr(1).replace(/\/$/, ''), field, negate )     // Regex
      : makeReFilter( `^${pattern.replace(/\*+/g, '.*')}$`, field, negate )     // Glob-like
}

// Generate all Spaces that pass the Space name filter
function* spaces_filtered() {
    yield* Object.values(spaces)
        .filter( makeFilter(options.space) )
        .sort( (a,b) => a.name.localeCompare(b.name) )
}

// Generate all Types in the given space that pass the Type name filter
function* types_filtered( space ) {
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

const getAutomationKindSubpath = (kind) =>
    kind.match( /rule/i   ) ? 'auto-rules' :
    kind.match( /button/i ) ? 'buttons'    :
    assert.ok( false )

// Get all Button/Rule definitions for a Type/DB
async function getAutomationsForType( kind, space, typeId, forceCache=null ) {
    const kindPath  = getAutomationKindSubpath(kind)
    const result    = await cachify(space, typeId, kind, forceCache,
        async() => fiberyFetch(`/api/automations/${kindPath}/for-type/${typeId}`, 'GET'))
    assert.ok(result instanceof Array)
    return result
}

// Generate a script's Id comment line
const scriptIdHeader = ( automationId, actionId ) => `//.fibery SCRIPTID=${automationId} ACTIONID=${actionId}\n`

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

// Save an automation action script locally
function saveLocalActionScript( typeDir, automationKind, automation, action ) {
    const script     = action.args.script.value
    const scriptPath = localActionScriptPath(typeDir, automationKind, automation.name, automation.id, action.id)
    if (!options.quiet) log(`Saving:  \t${scriptPath}`)
    if (options.fake) return
    const apiHeader  = scriptIdHeader(automation.id, action.id)
    const bareScript = deleteScriptHeaders(script)
    const newScript  = `${apiHeader}\n${bareScript}`
    fs.writeFileSync(scriptPath, newScript)
}

// Push an entire Button or Rule automation definition to the Workspace
async function updateAutomation( kind, automation ) {
    // const        {name, triggers, actions, id} = automation
    // const data = {name, triggers, actions}
    // return fiberyFetch(`/api/automations/${kindPath}/${id}`, 'PUT', data)
    const {id}      = automation
    const kindPath  = getAutomationKindSubpath(kind)
    return fiberyFetch(`/api/automations/${kindPath}/${id}`, 'PUT', automation)
}

//---------------------------------------------------------------------------------------------------
// Pull: Get automation script definitions from Fibery Workspace
//
async function pull() {
    await doSetup()
    let spacesCount=0, typesCount=0, automationsCount=0, actionsCount=0
    for (const space of spaces_filtered()) {
        ++spacesCount
        if (options.verbose) log( `Scanning Space:    \t${space.name}  \t${space.id}` )

        for (const type of types_filtered(space)) {
            ++typesCount
            const typeId = type['fibery/id'], typeName = type['fibery/name'], typeDir = getTypeDir(space, typeId)
            if (options.verbose) log(`Scanning DB:        \t${typeName} \t${typeId}`)

            function processAutomations( automationKind, automations ) {
                for (const automation of automations) {
                    ++automationsCount
                    if (options.verbose) log(`Scanning ${automationKind}:    \t${automation.name} \t${automation.id}`)
                    // Check each action for a script
                    for (const action of automation.actions) {
                        if (action.args?.script) {
                            ++actionsCount
                            saveLocalActionScript(typeDir, automationKind, automation, action)
                        }
                    }
                }
            }

            processAutomations( 'Button', buttons_filtered( await getAutomationsForType('buttons', space, typeId, false) ))  // no cache
            processAutomations( 'Rule',     rules_filtered( await getAutomationsForType(  'rules', space, typeId, false) ))  // no cache
        }
    }

    if      (spacesCount     ==0) warn('No spaces were matched - check your `--space` filter.')
    else if (typesCount      ==0) warn('No DBs were matched - check your `--db` filter.')
    else if (automationsCount==0) warn('No automations were matched - check your filters.')
    else if (actionsCount    ==0) warn(`${automationsCount} automations were matched, but no script actions were found.`)
    else                           log(`${actionsCount} actions ${options.fake ? 'found to save':'were saved'}`)
}

//---------------------------------------------------------------------------------------------------
// Push: Get automation script definitions from Fibery Workspace
//
async function push() {
    await doSetup()
    // Process all matching Spaces
    let spacesCount=0, typesCount=0, automationsCount=0, actionsCount=0
    for (const space of spaces_filtered(workspace)) {
        ++spacesCount
        if (options.verbose) log(    `Scanning Space:     \t${space.name}  \t${space.id}` )

        // Process all matching Types
        for (const type of types_filtered(space)) {
            ++typesCount
            if (options.verbose) log(`Scanning DB:        \t${type['fibery/name']} \t${type['fibery/id']}`)
            const typeId  = type['fibery/id']
            const typeDir = await getTypeDir(space, typeId)

            // Update automation actions for Buttons or Rules
            async function updateActions( automationKind, automations ) {
                ++automationsCount
                // Check each automation (Button/Rule) in this Type/DB
                for (const automation of automations) {
                    ++automationsCount
                    if (options.verbose) log(`Scanning ${automationKind}:    \t${automation.name} \t${automation.id}`)
                    let dirtyCount = 0                                      // How many actions to update in current automation?
                    if (options.nofiles) {
                        // When --nofiles is specified, push entire cached automation definitions, ignoring local script files
                        ++dirtyCount
                        actionsCount += automation.actions.length
                        if (!options.quiet) log(`Pushing cached ${automationKind}: \t${automation.name}`)
                    }
                    else {
                        // Check each action in the automation
                        for (const action of automation.actions) {
                            if (!action?.args?.script) continue             // Ignore this action: not a script
                            const scriptPath = localActionScriptPath(typeDir, automationKind, automation.name, automation.id, action.id)
                            if (!doesPathExist(scriptPath)) {
                                warn(`Local script file not found: ${scriptPath}} -- use \`${thisScriptName} pull\` to get current script definitions from Fibery`)
                                warn(`No 'push' will be done for ${automationKind} "${automation.name}"`)
                                returnCode  = 1
                                dirtyCount  = 0                             // Don't update any actions in this automation
                                break
                            }
                            ++actionsCount
                            const bareScript = deleteScriptHeaders( readFileSync(scriptPath) )
                            const apiHeader  = scriptIdHeader(automation.id, action.id)
                            const gitHeader  = scriptGitHeader(scriptPath)
                            const newScript  = `${apiHeader}${gitHeader}\n${bareScript}`    // Add script headers
                            action.args.script.value = newScript            // Update the automation action with the local script
                            log(`Pushing: \t${scriptPath}`)
                            ++dirtyCount
                        }
                    }
                    if (dirtyCount>0) {
                        // Update the entire automation
                        await updateAutomation(automationKind, automation)
                    } else {
                        if (options.verbose) log(`no actions to update for ${automationKind} [${space.name}/${type.name}] ${automation.name}`)
                    }
                }
            }

            // Always force cache when getting automations to update:
            // When '--nofiles' is true, ALWAYS get old automations from cache so we will push entire historical automation definitions;
            // otherwise NEVER use cache, so we will always get the CURRENT automation defs from Fibery and then only update the action scripts.
            const forceCache = options.nofiles
            await updateActions('Button', buttons_filtered( await getAutomationsForType('buttons', space, typeId, forceCache) ))
            await updateActions('Rule',     rules_filtered( await getAutomationsForType('rules',   space, typeId, forceCache) ))
        }
    }

    if      (spacesCount==0)         warn('No spaces were matched - check your `--space` filter.')
    else if (typesCount==0)          warn('No DBs were matched - check your `--db` filter.')
    else if (automationsCount==0)    warn('No automations were matched - check your filters.')
    else if (actionsCount==0)        warn(`${automationsCount} automations were matched, but no script actions were found.`)
    else log(`${actionsCount} actions ${options.fake ? 'found to push':'were updated'}`)
}

//---------------------------------------------------------------------------------------------------
// Purge: Trim older cache files
//
async function purge() {
    await doSetup()
    let filesPurged = 0

    // Process all cache files in dirPath
    function purgeCacheFiles( dirPath ) {
        for (fileName of readdirSync(dirPath)) {
            const m         = fileName.match( /(?<year>\d\d\d\d)-(?<month>\d\d)-(?<day>\d\d) (?<hours>\d\d).(?<minutes>\d\d).(?<seconds>\d\d)\.(?<ms>\d+)\.jsonc$/ )
            if (!m) continue
            const {year, month, day, hours, minutes, seconds, ms} = m.groups
            const fileDate  = new Date()
            fileDate.setFullYear(year, month-1, day)
            fileDate.setHours(hours, minutes, seconds, ms)
            if (fileDate>cacheBefore || fileDate<cacheAfter) continue
            const filePath  = path.join(dirPath, fileName)
            log(`deleting: \t${filePath}`)
            if (!options.fake) fs.unlinkSync(filePath)
            ++filesPurged
        }
    }

    const cacheDir = getSpaceDir()
    purgeCacheFiles( path.join(cacheDir, '.schema') )
    purgeCacheFiles( path.join(cacheDir, '.spaces') )

    for (const space of spaces_filtered()) {
        for (const type of types_filtered(space)) {
            const typeDir = getTypeDir(space, type['fibery/id'])
            purgeCacheFiles( typeDir, '.buttons')
            purgeCacheFiles( typeDir, '.rules')
        }
    }
    log(`${options.fake ? 'Found':'Purged'} ${filesPurged} cache files ≤ ${cacheBefore}`)
}

// Get Space/DB Id from directory token file
function getDirTokenId( path, suffix ) {
    const  tokenFilename = readdirSync(path).find( name => name.endsWith(suffix) )
    return tokenFilename?.replace(/^\.?([-\w]+)\.\w*/, '$1')
}

// Get the automation Ids from the API header comment in a script file
function parseFileActionIds( scriptFilePath ) {
    const  fileText = readFileSync(scriptFilePath)
    const  [, scriptId,  actionId] = fileText.match(/\/\/\.fibery\s+SCRIPTID=([-\w]+)\s+ACTIONID=([-\w]+)/) || []
    return [scriptId, actionId]
}

// Find a Button/Rule action in automations by its Ids
function findActionInAutomations( automations, scriptId, actionId ) {
    const auto   =    automations.find( a => a.id===scriptId )
    const action = auto?.actions?.find( a => a.id===actionId )
    return action
}

//---------------------------------------------------------------------------------------------------
// Orphans: List local entities no longer existing in the Fibery Workspace
//
async function orphans() {
    myAssert(!options.button && !options.rule, 'The `orphans` command does not use the `--rule` or `--button` options.')
    await doSetup()

    const trailingDirSep = path.sep
    const filteredSpaces = Array.from( spaces_filtered() )

    // Scan all Space dirs
    for (const spaceDir of readdirSync(domainDir).filter(dir => dir.startsWith('SPACE~ '))) {
        const spacePath = path.join(domainDir, spaceDir)
        const   spaceId = getDirTokenId(spacePath, '.space')
        if (!spaceId) {
            warn(`Space dir does not have an Id: \t${spacePath}`)
            continue
        }
        const space = filteredSpaces.find( s => s.id===spaceId )
        if (!space) {
            log(`Orphaned Space: \t${spacePath + trailingDirSep}`)
            continue
        }
        const types = Array.from(types_filtered(space))

        // Scan all Types/DBs in the Space dir
        for (const typeDir of readdirSync(spacePath).filter(dir => dir.startsWith('DB~ '))) {
            const  typePath = path.join(spacePath, typeDir)
            const  typeId   = getDirTokenId(typePath, '.db')
            if (!typeId) {
                warn(`DB dir does not have an Id: \t${typePath}`)
                continue
            }
            const type = types.find( t => t['fibery/id']===typeId )
            if (!type) {
                log(`Orphaned DB: \t${typePath + trailingDirSep}`)
                continue
            }
            const buttons = Array.from( await getAutomationsForType('buttons', space, typeId) )   // NOT filtered
            const rules   = Array.from( await getAutomationsForType(  'rules', space, typeId) )   // NOT filtered

            // Scan all files in Type/DB dir for orphaned scripts
            for (const fileName of readdirSync(typePath)) {
                const  filePath = path.join(typePath, fileName)
                if (!fileName.match(/^(?:BUTTON|RULE)~.*\.js/i)) {
                    if (!fileName.startsWith('.')) warn(`Ignoring unexpected filename: \t"${filePath}"`)
                    continue
                }
                const [scriptId, actionId] = parseFileActionIds(filePath)
                if (!scriptId || !actionId) {
                    warn(`Did not find valid Id comment in script: \t${filePath}`)
                    continue
                }
                const action = findActionInAutomations( fileName.match(/^BUTTON~/i) ? buttons : rules, scriptId, actionId )
                if (!action)
                    log(`Orphaned script: \t${filePath}`)
            }
        }
    }
}


//---------------------------------------------------------------------------------------------------
// MAIN
//
async function main() {
    parseCommandLineOptions()
    dbg(`${thisScriptName} ${positionals.join(' ')}   \t${JSON.stringify(options)}`)
    let cmd = positionals.shift()?.toLowerCase()
    if (cmd.match(/pull|push|purge/))   myAssert(options.button||options.rule, `You must specify the \`--button\` or \`--rule\` name filter (or both) for any automations to be processed by the \`${cmd}\` command.`)
    if (cmd!=='help')                   myAssert(positionals.length===0, `Unexpected command line arguments: ${positionals.join(' ')}`)
    if (cmd!=='push')                   myAssert(!options.nofiles, '`--nofiles` option can only be used with the `push` command')
    if (options.nofiles)                myAssert(options.cache, '`--nofiles` requires specifying the `--cache` option')

    switch (cmd || '')
    {
        case 'pull':
            await pull()
            break
            
        case 'push':
            await push()
            break
            
        case 'purge':
            myAssert(options.before, `\`${cmd}\` requires the \`--before\` option to specify the cutoff date (cache files older than this will be deleted).`)
            await purge()
            break
                
        case 'orphans':
            await orphans()
        break

        case '':
            if (options.validate)
                log(`FIBERY:      \t${FIBERY}\nFIBERY_DOMAIN:\t${FIBERY_DOMAIN}`)
            else
                help()
            returnCode = 1
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
