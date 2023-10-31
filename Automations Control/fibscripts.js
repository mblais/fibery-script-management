#!/usr/bin/env node
// fibscripts.js - Manage Fibery Automations remotely
//---------------------------------------------------------------------------------------------------
//TODO:
// - Restore automations from old cache file
// - Report orphaned local scripts no longer associated with a Workspace action

const fs                = require('node:fs')                // Synchronous
const path              = require('node:path')
const assert            = require('node:assert').strict
const { parseArgs }     = require('node:util')              // https://nodejs.org/api/util.html#utilparseargsconfig
const childProcess      = require('node:child_process')     // Synchronous
const { dir } = require( 'node:console' )
const MS_PER_DAY        = 24 * 60 * 60 * 1000

//---------------------------------------------------------------------------------------------------

let   debug             = true          // if truthy, same as --verbose option
const {log, warn}       = console
const dbg               = (...args) => { if (debug) log('-', ...args) }
const debugBreak        = () => { if (debug) debugger }
const thisScriptName    = path.basename( process.argv[1] ).replace(/\.[^.]+$/, '')    // Name of this program, without file extension

//---------------------------------------------------------------------------------------------------

let     options, positionals, FIBERY, FIBERY_DOMAIN, domainDir
let     workspace, schema, spaces
let     returnCode      = 0             // program return code

//---------------------------------------------------------------------------------------------------

// const stringify         = (arg) => JSON.stringify(arg,null,2)
const timestamp         = ( d=null ) => (d ?? new Date()).toLocaleString('sv', {year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric', second:'numeric', fractionalSecondDigits: 3}).replace(',', '.')
const startTimestamp    = timestamp()

function error(...args) {
    const err = args[0]
    if (err.stdout) err.stdout = err.stdout.toString()
    if (err.stderr) err.stderr = err.stderr.toString()
    console.error(`${thisScriptName}: `, ...args)
    debugBreak()
    process.exit(returnCode || 1)
}

const myAssert          = (condition, msg)      => { if (!condition) error(msg) }       // when you don't want a stack trace included
const isaDirectory      = (path)                => { try { return fs.lstatSync(path).isDirectory() } catch(err) { return null } }
const doesPathExist     = (fpath)               => { try { return fs.statSync(fpath)               } catch(err) { return null } }
const doesDirContain    = (dirPath, fileName)   => doesPathExist(path.join(dirPath, fileName))

//---------------------------------------------------------------------------------------------------
// Setup

// Parse command line options
const commandLineOptions = {
    domain:         { type: 'string',   short: 'd',                 },
    space:          { type: 'string',   short: 's',  default: '*'   },  // default: match everything
    type:           { type: 'string',   short: 't',  default: '*'   },  // default: match everything
    button:         { type: 'string',   short: 'b',  default: ''    },  // default: match nothing
    rule:           { type: 'string',   short: 'r',  default: ''    },  // default: match nothing
    cache:          { type: 'boolean',  short: 'c',  default: false },
    nogit:          { type: 'boolean',  short: 'g',  default: false },
    fake:           { type: 'boolean',  short: 'f',  default: false },
    verbose:        { type: 'boolean',  short: 'v',  default: false },
    validate:       { type: 'boolean',               default: false },
    yes:            { type: 'boolean',  short: 'y',  default: false },
}

// Setup and validate inputs
async function doSetup( noCache=false ) {
    // Parse command line args
    const {values, positionals: pos} = parseArgs({ args: process.argv.slice(2), options: commandLineOptions, allowPositionals: true })
    options             = values
    positionals         = pos ?? []
    debug               = debug || options.debug
    if( options.domain )  process.env.FIBERY_DOMAIN = options.domain            // --domain option overrides FIBERY_DOMAIN env var
    FIBERY_DOMAIN       = process.env.FIBERY_DOMAIN
    FIBERY              = process.env.FIBERY
    
    // If FIBERY_DOMAIN is an entire path, split out FIBERY as the root path and FIBERY_DOMAIN as the domain dir (last part)
    if (FIBERY_DOMAIN.indexOf(path.sep) >= 0) {
        const eSep      = `\\${path.sep}`                                       // escaped for regex
        const parts     = FIBERY_DOMAIN.replace(new RegExp(`${eSep}*$`), '')    // strip trailing directory separators
                          .split(path.sep)
        FIBERY_DOMAIN   = parts.pop()
        FIBERY          = path.join(...parts)
    }
    domainDir           = path.join(FIBERY, FIBERY_DOMAIN)                      // This is where everything for the domain is stored
    
    myAssert(isaDirectory(FIBERY), `FIBERY env var should hold the path to the root dir for all Fibery local domain dirs`)
    myAssert(FIBERY_DOMAIN, `Fibery domain must be defined by either FIBERY_DOMAIN env var or --domain arg`)
    maybeCreateDir( 'domain', domainDir)

    // Can/should we call fiberyConfig.sh to set some env vars?
    const configScript = path.join(FIBERY, 'fiberyConfig.sh')
    if (!process.env.FIBERY_API_KEY && doesPathExist(configScript)) try {
        // Call fiberyConfig.sh to get additional environment vars for the selected Fibery domain
        const moreEnvVars = execFileSync(configScript, ['-0', FIBERY_DOMAIN ?? '']).toString()
        // Add returned Fibery env vars to process.env
        for( const line of moreEnvVars.split('\0') ) {
            const [, name, value] = line.match( /(\w+)=([\S\s]*)/ ) ?? []
            if (name) process.env[name] = value
        }
    } catch (err) {}
    myAssert(process.env.FIBERY_API_KEY, `FIBERY_API_KEY env var is not defined for workspace "${FIBERY_DOMAIN}"`)
    
    getWorkspace(FIBERY_DOMAIN)
    await getSpaces(noCache)
    await getSchema(noCache)
}

function help( cmd ) {
    switch (cmd || '') {

        case 'pull':
            log(`
${thisScriptName} pull
    Download and save Fibery workspace Button and Rule Javascript actions.

    Use the filter options to limit what Spaces/DBs/Buttons/Rules will be retrieved:
        --space       -s    Space   name filter
        --type        -t    Type/DB name filter
        --button      -b    Button  name filter
        --rule        -r    Rule    name filter
`)
            break

        case 'push':
            log(`
${thisScriptName} push
    Push local Javascript Button and Rule actions back to Fibery workspace.

    Use the filter options to limit what Spaces/DBs/Buttons/Rules will be updated:
        --space       -s    Space   name filter
        --type        -t    Type/DB name filter
        --button      -b    Button  name filter
        --rule        -r    Rule    name filter
`)
            break

        case 'purge {days}':
            log(`
${thisScriptName} purge {days}
    Purge local cache entries older than {days}.

    Old cache files are not automatically deleted. Use the \`purge {days}\` program command to trim them. {days} are 24-hour periods relative to now and are not rounded but can be fractional.

    Use the filter options to limit what Spaces/DBs/Buttons/Rules will be affected:
        --space       -s    Space   name filter
        --type        -t    Type/DB name filter
        --button      -b    Button  name filter
        --rule        -r    Rule    name filter
`)
            break

        case '':
            log(`
${thisScriptName} - Manage Fibery automation scripts locally

Usage:  ${thisScriptName}  [ help {cmd} | pull | push | purge ]  [ options... ]

COMMANDS:

    help [cmd]          Show help, optionally for a specific program command
    pull                Download and save Fibery workspace Button and Rule Javascript actions
    push                Push local Javascript Button and Rule actions back to Fibery workspace
    purge {days}        Delete cache entries older than {days} (can be fractional)

OPTIONS:                (can appear anywhere on the command line)

    --domain      -d    The Fibery domain, e.g. "my.fibery.io" - or the full path to the local domain dir
    --space       -s    Space   name filter
    --type        -t    Type/DB name filter
    --button      -b    Button  name filter
    --rule        -r    Rule    name filter
    --cache       -c    Use existing cached Space/Type info instead getting it from Fibery
    --nogit       -g    Don't try to use git (for when your local script files are not tracked in git)
    --yes         -y    Create local storage directories as needed
    --fake        -f    Dry run - don't actually change or write anything
    --verbose     -v    Verbose output

ENVIRONMENT VARIABLES:

    FIBERY              Base path containing dirs for each Fibery domain you manage
    FIBERY_DOMAIN       The Fibery domain to manage (or specify this with the --domain option)
    FIBERY_API_KEY      API key for the Fibery domain - get it from "Fibery Settings > API Keys"

BASIC OPERATION

    The Fibery domain to manage (e.g. "my.fibery.io") is specified by the FIBERY_DOMAIN env var or the --domain option. It also defines the directory name under $FIBERY where the hierarchy of Fibery scripts for the domain will be stored.
    
    If FIBERY_DOMAIN is just the domain (e.g. "my.fibery.io") then the FIBERY env var specifies the parent directory (e.g. "/home/me/fibery/") for the domain directory(ies).
    
    FIBERY_DOMAIN can alternatively specify the full path to the domain directory (e.g. "/home/me/fibery/my.fibery.io"), in which case the FIBERY env var is ignored.

    Run \`${thisScriptName} pull\` to pull automation scripts from a Fibery workspace and store them in local *.js files under a directory hierarchy that mirrors the workspace's Spaces and DBs/Types.

    Run \`${thisScriptName} push\` to push local *.js script files back to the Fibery workspace. Comments are inserted at the top of each script for identification and git info.

    The options \`--space\` \`--type\` \`--button\` and \`--rule\` define name filters that define which specific Fibery elements will be processed by a push/pull/purge command.

FILTERS:

    Filters are used to define the scope of a program operation to certain Spaces/DBs/Buttons/Rules.

    Filters are glob-like by default, or regex if preceded by '/' (trailing slash not required). Any filter is negated if the first character is '!'. Filters are always case-insensitive.

    If no filter is specified for a Space/DB, all Spaces/DBs will be processed.
    
    If no filter is specified for a Button/Rule, NONE will be processed. So you must specify either the \`--button\` or \`--rule\` filter (or both) in order for any automations to be processed.
    
    Only one filter can be defined for each category. All supplied filters must match an item for it to be processed.

DIRECTORY STRUCTURE

    ${thisScriptName} stores the data pulled from a Fibery Workspace in a hierarchy of local folders. These directories are automatically created as needed if the \`--yes\` option is specified. If \`--yes\` is not specified an error is generated for a missing directory.

    The base directory containing all Fibery workspaces is defined by the FIBERY env var (though it can also be specified in FIBERY_DOMAIN). In the main FIBERY directory are directories for each specific Fibery workspace (domain). The workspace to use must be specified via the FIBERY_DOMAIN env var or the \`--domain\` option; e.g. \`--domain=mydomain.fibery.io\`.

    Within a workspace directory are directories for each Space, named \`SPACE~ {space-name}\`, and under those are directories for each Type/DB, named \`DB~ {DB-name}\`.

    Each script action in a Button/Rule automation will be stored in its respective DB~ directory, named either \`BUTTON~ {Button-name} ~{id}.js\` or \`RULE~ {Rule-name} ~{id}.js\`. The 'id' in the name is used to correlate each script to a specific action with the automation (because there can be more than one script action within an automation).

    The program will detect when a Space/DB/Automation has been renamed in Fibery, and if the \`--yes\` option is active the program will try to rename the local file/directory to match the new Fibery name using \`git mv\` (unless \`--nogit\` is specified, in which case the directory is renamed with the default OS function).

    Some cache directories and housekeeping files are also created throughout the file hierarchy; their names always begin with a period.

CACHING

    The results of Fibery API queries are cached in files that begin with a period. These API results can be reused instead of re-querying Fibery by specifying the \`--cache\` option. However this will not save much time unless you have very many Spaces and DB's and automations to process.
    
    These cache files also serve as backups since they contain the complete definitions of all automations pulled from Fibery.

    Old cache files are not automatically deleted. Use the \`purge {days}\` program command to trim older cache files. {days} are 24-hour periods relative to now, and can be fractional.

EXAMPLES

    ${thisScriptName}  pull                         # Pulls ALL action scripts from Fibery, overwriting local files
    ${thisScriptName}  pull '--space=test*'         # Pulls action scripts only from Spaces beginning with "test"
    ${thisScriptName}  pull '--space=!/test|foo'    # Pulls action scripts only from Spaces NOT beginning with "test" or "foo"
    ${thisScriptName}  pull '--rule=/test|foo'      # Pulls action scripts from Rules beginning with "test", and ALL Buttons
    ${thisScriptName}  push                         # Pushes ALL local script actions to Fibery, overwriting existing Workspace scripts
    ${thisScriptName}  push '--space=test*'         # Pushes local script actions for Spaces beginning with "test", overwriting existing Workspace scripts
    ${thisScriptName}  push '--button=/test|foo'    # Pushes local script actions for Buttons containing "test" or "Foo" AND all Rules, overwriting existing Workspace scripts
    ${thisScriptName}  purge 7.5                    # Deletes local API cache files older than 7.5 days
`)
            break

        default:
            error(`Unrecognized command "${cmd}"`)
    }
    returnCode = 1
}

// Join all non-null args with delimiter
const joinNonNull = (delimiter, ...args) => args.reduce( (accum, arg) => accum + (
    arg==null ? '' : arg + delimiter), '')

// Fibery API call
async function fiberyFetch( address, method, data=null ) {
    const url       = `https://${FIBERY_DOMAIN}${address}`
    const body      = data==null ? null : { body: data }
    let   response
    try {                      
        dbg(`fiberyFetch:        \t${url}  \t${typeof data==='string' ? data : JSON.stringify(data)}`)
        response    = await fetch(url, {
            method,
            headers: {
                'Content-Type':  'application/json; charset=utf-8',
                'Authorization': `Token ${process.env.FIBERY_API_KEY}`,
            },
            ...body
        })
        if (response?.status!==200)
            error(`${response?.status}: ${response?.statusText}\n${url}`)
        return response.json()
    } catch (err) {
        error(`${joinNonNull('\n', err?.cause, response?.status, response?.statusText)}\n${url}`)
    }
}

// Class to represent user-defined Spaces and Types in a Fibery Workspace
class FiberyWorkspaceSchema {
    constructor( schemaRaw ) {
        this.types = Object.fromEntries( schemaRaw['fibery/types']
            .filter( t => !( t['fibery/deleted?'] ||
                             t['fibery/meta']?.['fibery/enum?'] ||
                             t['fibery/name'].match(/^[a-z]|^Collaboration~Documents\//) ))
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
// File functions
//

// Readdir (sync, no exceptions thrown)
function readdirSync( dir ) {
    try { return fs.readdirSync(dir) }
    catch(err) { return [] }
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
function execGitCommandSync( gitArgs, execOptions ) {
    const  gitProgram = 'git'
    const  result     = execFileSync(gitProgram, gitArgs, execOptions)
    return result
}

// Create a token filename to identify a space/type dir
const tokenFileName = (tokenType, id) => `.${id}.${tokenType}`

// Create a dir (and maybe token file) if it doesn't already exist (maybe)
function maybeCreateDir( type='', dir, tokenFile=null ) {
    if (!isaDirectory(dir)) {
        if (!options.yes)
            error(`Missing ${type} dir "${dir}" - Use the \`--yes\` option to create missing directories automatically`)
        warn(`Creating ${type} dir: \t${dir}`)
        if (!options.fake)
            fs.mkdirSync(dir, {recursive: true})
    }

    if (tokenFile) {
        // Create the dir's token file (to identify the dir by its Fibery id)
        const tokenPath = path.join(dir, tokenFile)
        if (!doesPathExist(tokenPath) && !options.fake)
            fs.writeFileSync(tokenPath, '')
    }

    return dir
}    

// Check whether a file/dir should be renamed, and maybe rename it.
// When a file/dir was found via its Fibery id, but it has a different local name than what's in Fibery
// then we want to rename it to keep the local name in sync with its Fibery name.
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
        if (!gitmv?.message?.match('not under version control')) {
            warn('git mv: ' + gitmv.message)    // git error
            return existingPath
        }
    }
    // Regular OS rename
    fs.renameSync(existingPath, idealPath)
    return idealPath
}

// Test whether the specified file's content matches the pattern
function testFileContentMatch( filePath, pattern ) {
    if (!doesPathExist(filePath)) return null
    const  content = fs.readFileSync(filePath)?.toString()
    return content?.match(pattern)
}

// Find an existing script file by its identifying header comment line containing its Fibery Id
function find_scriptFile_byHeader( typeDir, idealFilePath, header ) {
    // Test the ideal filePath first
    if (testFileContentMatch(idealFilePath, header))
        return idealFilePath
    // Look for a script file in the typeDir that contains the specified header line
    const ext = path.extname(idealFilePath)                     // includes the '.'
    for (const fname of readdirSync(typeDir)) {
        if (!fname.endsWith(ext)) continue                      // filter out cache subdirs
        const filePath = path.join(typeDir, fname)
        if (testFileContentMatch(filePath, header))
            return filePath
    }
    return null
}

// Find the local *.js script file path for an action
function localActionScriptPath( typeDir, automationType, automationName, automationId, actionId ) {
    const idHeader      = scriptIdHeader(automationId, actionId)
    const scriptAction  = actionId.slice(-4)                                // Differentiates multiple scripts in the same Automation
    const fileName      = `${automationType.toUpperCase()}~ ${automationName} ~${scriptAction}.js`   // This is what the script filename should be
    const idealFile     = path.join(typeDir, fileName)
    const existingFile  = find_scriptFile_byHeader(typeDir, idealFile, idHeader)
    return maybeRenameExisting('script', existingFile, idealFile)
}

// Find a subdir that comtains the specified token file
function findSubdirByTokenFile(parentDir, tokenFile) {
    for (const fname of readdirSync(parentDir)) {
        const  subdir = path.join(parentDir, fname)
        if (doesDirContain(subdir, tokenFile))
            return subdir
    }    
    return null
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

// Get cached or fresh object
async function cachify( space, typeId, cacheType, creatorFunc, noCache=false ) {
    const cacheDir              = getCacheDir(space, typeId, cacheType)
    if (options.cache && !noCache) {
        // Use cached data if available
        const cacheFiles        = readdirSync(cacheDir)
        if (cacheFiles) {
            // Cache filenames are a timestamp of when they were created - find most recent by filename
            const latest        = cacheFiles.filter( name => name.match(/^\d\d\d\d-\d\d-\d\d \d\d.\d\d.\d\d.*\.jsonc$/) )
                .sort().slice(-1)[0]
            if (latest) {
                dbg(`reading  cache:   \t${path.join(cacheDir, latest)}`)
                let content     = fs.readFileSync(path.join(cacheDir, latest)).toString()
                while (!content.match(/^\s*[[{}]/))         // Delete any leading comment lines before JSON
                    content     = content.replace(/.*[\r\n]*/, '')
                const obj       = JSON.parse(content)
                return obj
            }
        }
    }
    // Get fresh data
    const obj = await creatorFunc()
    // Write the fresh data to a new cache entry
    const timestamp     = startTimestamp.replace(/:/g, '_')     // Windows can't handle ':' in filenames
    const cacheFilename = path.join(cacheDir, `${timestamp}.jsonc`)
    const content       = `//# ${cacheFilename}\n` + JSON.stringify(obj)
    dbg(`saving   cache:    \t${path.join(cacheDir, cacheFilename)}`)
    if (!options.fake)
        fs.writeFileSync(cacheFilename, content)
    return obj
}

// Get/create the Workspace dir for the Fibery domain
function getWorkspace( domain ) {
    workspace = path.join(FIBERY, domain)
    return maybeCreateDir('workspace', workspace)
}

//---------------------------------------------------------------------------------------------------

// Get the Workspace schema
async function getSchema( noCache=false ) {
    const data = await cachify(null, null, 'schema', async() => {
        const data = await fiberyFetch( '/api/commands', 'POST', '[{"command":"fibery.schema/query"}]'  )
        myAssert(data?.[0]?.success, `Error retrieving schema for ${FIBERY_DOMAIN} - check your FIBERY_API_KEY?`)
        return data
    }, noCache)
    schema = new FiberyWorkspaceSchema( data[0].result )
    // dbg( Object.entries(schema.spaces).map( ([n,s]) => [ n, s['fibery/id'] ] ) )    // Dump Spaces names and id's
}

// Get the list of Spaces in the Fibery workspace
async function getSpaces( noCache=false ) {
    spaces = await cachify(null, null, 'spaces', async() => {
        const data = await fiberyFetch( '/api/commands?reason=preload&command=fibery.app/get-available-apps', 'POST', '[{"command":"fibery.app/get-available-apps","args":{}}]' )
        myAssert(data?.length > 0, `Could not read spaces for ${FIBERY_DOMAIN} - check your FIBERY_API_KEY env var`)
        const result = {}
        for (const space of data[0].result) {
            const name = space['app-namespace']
            if (!name.match(/^[a-z]|^Collaboration~Documents/))
                result[name] = { name, id: space['app-id'] }
        }
        myAssert(Object.keys(result)?.length > 0, `Did not fetch any spaces from ${FIBERY_DOMAIN}`)
        return result
    }, noCache)
}

// Create a filter function for names of Rules/Buttons/Spaces/Types
function makeFilter( pattern, field='name' ) {
    if (!pattern)
        return            () => false
    if (pattern==='.' || pattern==='*')
        return            () => true                            // Match everything
    const negate        = pattern.startsWith('!')               // Start a pattern with '!' to negate it
    if (negate) pattern = pattern.substr(1)

    const makeReFilter  = (pat, field) => { 
        const re        = new RegExp(pat, 'i')
        return negate   ? (obj) =>  !re.exec(typeof obj==='string' ? obj : obj[field])
                        : (obj) => !!re.exec(typeof obj==='string' ? obj : obj[field])
    }
    return pattern.startsWith('/') ?
            makeReFilter( pattern.substr(1).replace(/\/$/, ''),     field )      // Regex
          : makeReFilter( `^${pattern.replace(/([*?])/g, '.$1')}$`, field )      // Glob
}

// Generate all Spaces that pass the Space name filter
function* spaces_filtered() {
    const filtr = makeFilter(options.space)
    yield* Object.values(spaces)
        .filter( (space) => space.name!='Files' && filtr(space) )
        .sort(     (a,b) => a.name.localeCompare(b.name) )
}

// Generate all Types in the given space that pass the Type name filter
function* types_filtered( space ) {
    if (!space?.types) return            // This Space has NO types/DBs defined
    yield* Object.values(space.types)
        .filter( makeFilter(options.type) )
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

// Get all Button definitions for a Type
async function getButtonsForType( space, typeId, noCache=false ) {
    const result = await cachify( space, typeId, 'buttons',
        async() => fiberyFetch(`/api/automations/buttons/for-type/${typeId}`, 'GET'), noCache )
    assert.ok(result instanceof Array)
    return result
}

// Get all Rule definitions for a Type
async function getRulesForType( space, typeId, noCache=false ) {
    const result = await cachify( space, typeId, 'rules',
        async() => fiberyFetch(`/api/automations/auto-rules/for-type/${typeId}`, 'GET'), noCache )
    assert.ok(result instanceof Array)
    return result
}

// Update an automation (Button or Rule) in the Fibery workspace
async function updateAutomation( automationType, automation ) {
    const auto  = automationType.match(/rule/i)   ? 'auto-rules' :
                  automationType.match(/button/i) ? 'buttons'    :
                  assert.ok(false)
    const {name, triggers, actions, id} = automation
    const data  = {name, triggers, actions}
    if (options.fake) return
    await fiberyFetch(`/api/automations/${auto}/${id}`, 'PUT', JSON.stringify(data))
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
function saveLocalActionScript( typeDir, automationType, automation, action ) {
    const script     = action.args.script.value
    const filePath   = localActionScriptPath(typeDir, automationType, automation.name, automation.id, action.id)
    dbg(`Saving   action:    \t${filePath}`)
    if (options.fake) return
    const apiHeader  = scriptIdHeader(automation.id, action.id)
    const bareScript = deleteScriptHeaders(script)
    const newScript  = `${apiHeader}\n${bareScript}`
    fs.writeFileSync(filePath, newScript)
}

//---------------------------------------------------------------------------------------------------
// Pull: Get automation script definitions from Fibery Workspace
//
async function pull() {
    let spacesCount=0, typesCount=0, automationsCount=0, actionsCount=0
    for (const space of spaces_filtered()) {
        ++spacesCount
        dbg( `Scanning space:    \t${space.name}\t${space.id}` )

        for (const type of types_filtered(space)) {
            ++typesCount
            const typeId = type['fibery/id'], typeName = type['fibery/name'], typeDir = getTypeDir(space, typeId)
            dbg(`Scanning DB:        \t${typeName} \t${typeId}`)

            function processAutomations( automationType, automations ) {
                for (const automation of automations) {
                    ++automationsCount
                    dbg(`Scanning ${automationType}: \t${automation.name} \t${automation.id}`)
                    // Check each action for a script
                    for (const action of automation.actions) {
                        if (action.args?.script) {
                            ++actionsCount
                            saveLocalActionScript(typeDir, automationType, automation, action)
                        }
                    }
                }
            }

            processAutomations( 'Button', buttons_filtered( await getButtonsForType(space, typeId, true) ))
            processAutomations( 'Rule',   rules_filtered(   await getRulesForType(  space, typeId, true) ))
        }
    }

    if      (spacesCount     ==0) warn('No spaces were matched - check your `--space` filter.')
    else if (typesCount      ==0) warn('No DBs were matched - check your `--type` filter.')
    else if (automationsCount==0) warn('No automations were matched - check your filters.')
    else if (actionsCount    ==0) warn(`${automationsCount} automations were matched, but no script actions were found.`)
    else                           log(`${actionsCount} actions ${options.fake ? 'found to process':'were saved'}`)
}

//---------------------------------------------------------------------------------------------------
// Push: Get automation script definitions from Fibery Workspace
//
async function push() {
    // Process all matching Spaces
    let spacesCount=0, typesCount=0, automationsCount=0, actionsCount=0
    for (const space of spaces_filtered(workspace)) {
        ++spacesCount
        dbg(    `Scanning space:     \t${space.name}\t${space.id}` )
        
        // Process all matching Types
        for (const type of types_filtered(space)) {
            ++typesCount
            dbg(`Scanning DB:        \t${type['fibery/name']} \t${type['fibery/id']}`)
            const typeId  = type['fibery/id']
            const typeDir = await getTypeDir(space, typeId)
            
            // Update automation actions from local script files
            async function updateActions( automationType, automations ) {
                ++automationsCount
                let   dirtyCount    = 0                                 // How many actions were updated?
                // Check each automation (Button/Rule) in this Type
                for (const automation of automations) {
                    ++actionsCount
                    dbg(`Scanning ${automationType}:    \t${automation.name} \t${automation.id}`)
                    let actionNum   = 0
                    // Check each action in this automation
                    for (const action of automation.actions) {
                        ++actionNum
                        if (!action?.args?.script) continue             // Ignore this action: not a script
                        const scriptPath = localActionScriptPath(typeDir, automationType, automation.name, automation.id, action.id)
                        if (!doesPathExist(scriptPath)) {
                            warn(`Local script file not found: ${scriptPath}} -- use \`${thisScriptName} pull\` to get current script definitions from Fibery`)
                            dirtyCount  = 0                             // Don't update any actions in this automation
                            break
                        }
                        const bareScript = deleteScriptHeaders( fs.readFileSync(scriptPath).toString() )
                        const apiHeader  = scriptIdHeader(automation.id, action.id)
                        const gitHeader  = scriptGitHeader(scriptPath)
                        const newScript  = `${apiHeader}${gitHeader}\n${bareScript}`    // Add script headers
                        action.args.script.value = newScript            // Update the automation action with the local script
                        dbg(`pushing  action:   \t${scriptPath}`)
                        ++dirtyCount
                    }
                    // Update all actions in this automation
                    if (dirtyCount>0)
                        await updateAutomation(automationType, automation)
                    else
                        dbg(`no actions to update for ${automationType} [${space.name}/${type.name}] ${automation.name}`)
                }
            }

            await updateActions('Button', buttons_filtered( await getButtonsForType(space, typeId, true) ))
            await updateActions('Rule',   rules_filtered(   await getRulesForType(  space, typeId, true) ))
        }
    }

    if      (spacesCount==0)         warn('No spaces were matched - check your `--space` filter.')
    else if (typesCount==0)          warn('No DBs were matched - check your `--type` filter.')
    else if (automationsCount==0)    warn('No automations were matched - check your filters.')
    else if (actionsCount==0)        warn(`${automationsCount} automations were matched, but no script actions were found.`)
    else log(`${actionsCount} actions ${options.fake ? 'found to process':'were updated'}`)
}

//---------------------------------------------------------------------------------------------------
// Purge: Delete cache files older than X days
//
async function purge() {
    const maxAgeInDays  = parseFloat(positionals.shift())
    myAssert(maxAgeInDays >= 0, `"purge" requires the parameter {days} (maximum cache age in days to keep)`)
    const cutoffDate    = new Date() - maxAgeInDays * MS_PER_DAY
    let filesPurged     = 0

    function purgeCacheFiles( dir ) {
        // Delete all cache files in dir that are older than cutoff
        for (fileName of readdirSync(dir)) {
            const m         = fileName.match( /(?<year>\d\d\d\d)-(?<month>\d\d)-(?<day>\d\d) (?<hours>\d\d).(?<minutes>\d\d).(?<seconds>\d\d)\.(?<ms>\d+)\.jsonc$/ )
            if (!m) continue
            const {year, month, day, hours, minutes, seconds, ms} = m.groups
            const fileDate  = new Date()
            fileDate.setFullYear(year, month-1, day)
            fileDate.setHours(hours, minutes, seconds, ms)
            if (fileDate > cutoffDate) continue
            const filePath  = path.join(dir, fileName)
            log(`purging: \t${filePath}`)
            if (!options.fake) fs.unlinkSync(filePath)
            ++filesPurged
        }
    }

    purgeCacheFiles( path.join(domainDir, '.fibery', '.schema') )
    purgeCacheFiles( path.join(domainDir, '.fibery', '.spaces') )
    for (const space of spaces_filtered()) {
        for (const type of types_filtered(space)) {
            const typeDir = getTypeDir(space, type['fibery/id'])
            purgeCacheFiles( typeDir, '.buttons')
            purgeCacheFiles( typeDir, '.rules')
        }
    }
    log(`${options.fake ? 'Found':'Purged'} ${filesPurged} cache files older than ${cutoffDate}`)
}

//---------------------------------------------------------------------------------------------------
// MAIN
//
async function main() {
    await doSetup()
    dbg(`${thisScriptName} ${positionals.join(' ')}   \t${JSON.stringify(options)}`)
    let cmd = positionals.shift()
    switch (cmd || '')
    {
        case 'pull':
            myAssert(options.button||options.rule, `You must specify the \`--button\` or \`--rule\` name filter (or both) for any automations to be processed by the \`${cmd}\` command.`)
            await pull()
            break

        case 'push':
            myAssert(options.button||options.rule, `You must specify the \`--button\` or \`--rule\` name filter (or both) for any automations to be processed by the \`${cmd}\` command.`)
            await push()
            break
        
        case 'purge':
            await purge()
            break
        
        case '':
            if (options.validate) {
                log(`FIBERY:      \t${FIBERY}\nFIBERY_DOMAIN:\t${FIBERY_DOMAIN}`)
            }
            else
                help()
            break

        case 'help':
            help( positionals.shift() )
            break

        default:
            myAssert(false, `Unrecognized command "${cmd}"`)
            help()
            break
    }
}

main()
    .catch((err) => error(err) )
    .finally( () => process.exit(returnCode) )
