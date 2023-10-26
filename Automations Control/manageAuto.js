// Manage Fibery Automations remotely
//---------------------------------------------------------------------------------------------------
//TODO:
// git mv, insertGitInfo.sh

const fs                            = require('node:fs/promises')
const fss                           = require('node:fs')                // Synchronous
const path                          = require('node:path')
const assert                        = require('node:assert').strict
const { parseArgs }                 = require('node:util')              // https://nodejs.org/api/util.html#utilparseargsconfig
const childProcess                  = require('node:child_process')     // Synchronous
const { dir } = require( 'node:console' )

//---------------------------------------------------------------------------------------------------

const {log, warn}                   = console
let   debug                         = 1
const dbg = (...args) => { if (debug) log(...args) }

//---------------------------------------------------------------------------------------------------

let     workspace, schema, spaces
let     returnCode                  = 0
const   thisScriptName              = path.basename( process.argv[1] ).replace(/\.[^.]+$/, '')    // Name of this file, without extension

//---------------------------------------------------------------------------------------------------

const stringify = (arg) => JSON.stringify(arg,null,2)
const timestamp = ( d=null ) => (d ?? new Date()).toLocaleString('sv', {year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric', second:'numeric', fractionalSecondDigits: 3}).replace(',', '.')
const startTimestamp = timestamp()

function error(...args) {
    // if (typeof args[0]==='string') args[0] = `${thisScriptName}: ${args[0]}`
    // if (args[0] instanceof Error)
    console.error(...args)
    if (!returnCode) returnCode = 1
    debugger
}

const doesPathExist  = (fpath)                => { try{ return fss.statSync(fpath) } catch(e){ return null } }  // SYNCHRONOUS
const doesDirContain = (dirPath, fileName)    => doesPathExist(path.join(dirPath, fileName))                    // SYNCHRONOUS

//---------------------------------------------------------------------------------------------------
// Setup

// Parse command line options
const commandLineOptions = {
    domain:         { type: 'string',   short: 'd',                 },     // FIBERY_DOMAIN
    space:          { type: 'string',   short: 's',  default: '*'   },
    type:           { type: 'string',   short: 't',  default: '*'   },
    button:         { type: 'string',   short: 'b',                 },
    rule:           { type: 'string',   short: 'r',                 },
    cache:          { type: 'boolean',  short: 'c',  default: false },
    nogit:          { type: 'boolean',  short: 'g',  default: false },
    init:           { type: 'boolean',  short: 'i',  default: false },
    fake:           { type: 'boolean',  short: 'f',  default: false },
    verbose:        { type: 'boolean',  short: 'v',  default: false },
    // yes:            { type: 'boolean',  short: 'y',  default: false },
}
const args = process.argv.slice(2)
const {values: options, positionals} = parseArgs({ args, options: commandLineOptions, allowPositionals: true })
if( options.domain )  process.env.FIBERY_DOMAIN = options.domain
const FIBERY_DOMAIN = process.env.FIBERY_DOMAIN
const FIBERY        = process.env.FIBERY
debug               = debug || options.debug

async function doSetup() {
    // Validate inputs
    assert.ok(FIBERY, 'FIBERY env var should hold the path to the dir for Fibery domains')
    assert.ok(FIBERY_DOMAIN, `Fibery workspace domain must be defined either by FIBERY_DOMAIN env var or --domain arg`)

    const configScript = path.join(FIBERY, 'fiberyConfig.sh')
    if (!process.env.FIBERY_API_KEY && doesPathExist(configScript)) try {
        // Call fiberyConfig.sh to get additional environment vars for the selected Fibery domain
        const moreEnvVars = execFileSync(configScript, ['-0', FIBERY_DOMAIN ?? '']).toString()
        // Add Fibery env vars to process.env
        for( const line of moreEnvVars.split('\0') ) {
            const [, name, value] = line.match( /(\w+)=([\S\s]*)/ ) ?? []
            if (name) process.env[name] = value
        }
    } catch (err) {}
    assert.ok(process.env.FIBERY_API_KEY, `FIBERY_API_KEY env var is not defined for workspace "${FIBERY_DOMAIN}"`)
    
    getWorkspace(FIBERY_DOMAIN)
    await getSpaces(workspace)
    await getSchema(workspace)
}

// Dump Fibery env vars:
// dbg( Object.fromEntries( Object.keys(process.env).filter( k => k.match(/fibery/i) ).map( k => [k, process.env[k]] ) ) )

function help( cmd ) {
    switch (cmd || '') {

        case 'list':
            warn(`
${thisScriptName} list
    List automation definitions
`)
            break

        case 'pull':
            warn(`
${thisScriptName} pull
    Get automation definitions from Fibery Workspace
`)
            break

        case 'push':
            warn(`
${thisScriptName} push
    Push automation definitions to Fibery Workspace
`)
            break

        case 'purge {days}':
            warn(`
${thisScriptName} purge
    Purge cache entries older than {days}
`)
            break

        case '':
            warn(`
${thisScriptName} - Manage Fibery Automations scripts remotely

Usage:  ${thisScriptName}  [ help {cmd} | list | pull | push | purge ]  [ options... ]

COMMANDS:

    help [cmd]          Show help, optionally for a specific command
    list                List Button and Rules
    pull                Get  Button and Rule definitions from Fibery to local dirs
    push                Push local Button and Rule definitions to Fibery
    purge {days}        Delete all cache entries older than {days}

OPTIONS:

    --domain      -d    Fibery domain, e.g. example.fibery.io
    --space       -s    Space   name filter
    --type        -t    Type/DB name filter
    --button      -b    Button  name filter
    --rule        -r    Rule    name filter
    --cache       -c    Use existing cached info instead querying Fibery API
    --nogit       -g    Don't use git (if script files are not tracked in git)
    --init        -i    Create missing directories for Spaces and Types
    --fake        -f    Dry run: don't actually change or write anything
    --verbose     -v    Verbose output

NAME FILTERS:

    Name filters (for Space/Type/Button.Rule) are glob-like, or regex if preceded by '/'.
    A filter is negated if the first character is '-'. Filters are always case-insensitive.

REQUIRED ENVIRONMENT VARIABLES:

    FIBERY              Path to the Fibery domains directory (root of stored scripts and cache)
    FIBERY_API_KEY      From "Fibery Setings > API Keys" (specific to a Fibery Workspace)
`)
            break

        default:
            error(`Unrecognized command "${cmd}"`)
    }
    returnCode = 1
}

async function fiberyFetch( url, method, data=null ) {
    const body = data ? { body: (data instanceof Object ? JSON.stringify(data) : data) }
                      : null
    const response = await fetch( `https://${FIBERY_DOMAIN}${url}`, {
        method,         // *GET, POST, PUT, DELETE, etc.
        headers: {
            'Content-Type':  'application/json; charset=utf-8',
            'Authorization': `Token ${process.env.FIBERY_API_KEY}`,
        },
        ...body
    })
    if (response.status!==200)
        throw Error(`${response.status}: ${response.statusText}\nhttps://${FIBERY_DOMAIN}${url}`)
    return response.json()
}

// Class to represent Fibery Spaces and Types
class FiberyWorkspaceSchema {
    constructor( schemaRaw ) {
        this.types = Object.fromEntries( schemaRaw['fibery/types']
            .filter( t => !( t['fibery/deleted?'] ||
                             t['fibery/meta']?.['fibery/enum?'] ||
                            //  t['fibery/type'].startsWith('fibery/') || - type is only in fibery/fields
                             t['fibery/name'].match(/^[a-z]|^Collaboration~Documents\//) ))
            .map(    t =>   [t['fibery/name'], t] ) )
        this.spaces         = {}

        // Spaces and Types
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
const spaceId_from_spaceName    = (spaceName) => spaces[spaceName].id


//---------------------------------------------------------------------------------------------------
// File functions
//

// Readdir (sync, no expections thrown)
function readdirSync( dir ) {
    try { return fss.readdirSync(dir) }
    catch(err) { return [] }
}

// Execute a subprocess (sync)
function execFileSync( cmd, args, options ) {
    try {
        let result = childProcess.execFileSync(cmd, args, options) 
        if (result.stdout) result = result.stdout
        return result.toString()
    }
    catch (err) {
        err.stderr  = err.stderr.toString()
        err.message = err?.output
            ?.map(    o => o?.toString())
            ?.filter( o => o!=null && o!='' )
            ?.join(  '\n')
        return err
    }
}

// Create a dir if it doesn't exist
function maybeCreateDir( type, dir ) {
    if (!doesPathExist(dir)) {
        if (!options.init)
            error(`Missing ${type} dir "${dir}" - Use the \`--init\` option to create it automatically`)
        warn(`Creating ${type} dir: "${dir}"`)
        if (!options.fake)
            fss.mkdir(dir, {recursive: true})
    }    
    return dir
}    

// Check whether a file/dir should be renamed
// (i.e. if it was found by its Fibery id but with a different name than expected)
function maybeRenameExisting( typeDescription, existingPath, newPath ) {
    if (!existingPath || existingPath===newPath) return newPath
    //TODO: check with user, and maybe rename the dir to the new name
    dbg(`Rename:\t${typeDescription}     \t"${existingPath}" \t"${newPath}"`)
    if (options.fake) return existingPath
    if (!options.nogit) {
        // Try rename using `git mv`
        const gitmv = execFileSync('git', ['mv', existingPath, newPath], {cwd: workspace})
        if (gitmv.message && !gitmv.message.match('not under version control')) {
            warn('git mv: ' + gitmv.message)
            return existingPath
        }
        // Regular OS rename
        fss.renameSync(existingPath, newPath)
        return newPath
    }
}

// Test the specified file's content against the supplied pattern (regex/string)
function testFileContentMatch( filePath, pattern ) {
    if (!doesPathExist(filePath)) return null
    const  content = fss.readFileSync(filePath)?.toString()
    return content?.match(pattern)
}

// Find an existing Space dir by its Fibery Id
function findSpaceDir_byId( spaceId ) {
    const allSpaces = path.join(FIBERY, FIBERY_DOMAIN)
    const token     = `.${spaceId}.space`      // The space should contain this token file
    for (const fname of readdirSync(allSpaces)) {
        const dir   = path.join(allSpaces, fname)
        if (doesDirContain(dir, token))
            return dir
    }
    return null
}

// Find an existing Type dir by its Fibery Id
function findTypeDir_byId( spaceDir, typeId ) {
    const token     = `.${typeId}.type`      // The space should contain this token file
    for (const fname of readdirSync(spaceDir)) {
        const dir   = path.join(spaceDir, fname)
        if (doesDirContain(dir, token))
            return dir
    }
    return null
}

// Find an existing script file by its header line (Fibery Id)
function find_scriptFile_byHeader( typeDir, idealFilePath, header ) {
    // Test the ideal filePath first
    if (testFileContentMatch(idealFilePath, header))
        return idealFilePath
    // Look for any script file in the typeDir that contains the specified header line
    const ext = path.extname(idealFilePath)
    for (const fname of readdirSync(typeDir)) {
        if (!fname.endsWith(ext)) continue              // filter out cache subdirs
        const filePath = path.join(typeDir, fname)
        if (testFileContentMatch(filePath, header))
            return filePath
    }
    return null
}

// Find the local script file for an automation
function localScriptPath( automationName, typeDir, automationId, actionId ) {
    const apiHeader     = scriptApiHeader(automationId, actionId)
    const scriptAction  = actionId.slice(-4)                                // Differentiates multiple scripts in the same Automation
    const idealFile     = path.join(typeDir, `${automationName} ~${scriptAction}.js`)   // What the script filename SHOULD be
    const existingFile  = find_scriptFile_byHeader(typeDir, idealFile, apiHeader)
    return maybeRenameExisting('script', existingFile, idealFile)
}

// Get the dir for the given Space
function getSpaceDir( space=null ) {
    if (!space) return path.join(FIBERY, FIBERY_DOMAIN, '.fibery')
    let dir          = path.join(FIBERY, FIBERY_DOMAIN, `SPACE~ ${space.name}`)         // This is what the dirName should be
    const foundDir   = findSpaceDir_byId(space.id)
    if ( !foundDir )  return maybeCreateDir('space', dir)
    return maybeRenameExisting('space', foundDir, dir)
}

// Get the dir for the given Type
function getTypeDir( space, typeId ) {
    const spaceDir   = getSpaceDir(space)
    if (!typeId) return spaceDir
    const typeName   = typeName_from_typeId(typeId)
    const idealDir   = path.join(spaceDir, `DB~ ${typeName}`)                           // This is what the dirName should be
    const foundDir   = findTypeDir_byId(spaceDir, typeId)
    if ( !foundDir ) return maybeCreateDir('DB', idealDir)
    return maybeRenameExisting('DB', foundDir, idealDir)
}

// // Check if a file is tracked in git 
// function gitStatus( cwd, filename ) {
//     let gitstatus = execFileSync('git', ['status', '--short', '--porcelain', filename], {cwd})
//     if (gitstatus.stderr) {
//         warn(gitstatus.stderr.toString())
//         return null
//     }
//     return gitstatus.toString()
// }

// Execute a git command synchronously
function execGitCommandSync( gitArgs, execOptions ) {
    const gitProgram = 'git'
    const result     = execFileSync(gitProgram, gitArgs, execOptions)
    return result
}

//---------------------------------------------------------------------------------------------------
// Manage caches
//

// Get the cache dir for a Type + cacheType
function getCacheDir( space, typeId, cacheType ) {
    const dir = path.join(getTypeDir(space, typeId), `.${cacheType}`)
    return maybeCreateDir(cacheType, dir)
}

// Get some cached or fresh data (JSON)
async function cachify( space, typeId, cacheType, creatorFunc, useCache=true ) {
    const cacheDir          = getCacheDir(space, typeId, cacheType)
    if (options.cache && useCache) {
        // Use cached data if available
        const cacheFiles    = await fs.readdir(cacheDir)
        // Cache filenames are a timestamp of when they were created
        const latest        = cacheFiles.filter( name => name.match(/^\d\d\d\d-\d\d-\d\d \d\d.\d\d.\d\d.*\.jsonc$/) )
            .sort().slice(-1)[0]                        // Most-recently-created cache file
        if (latest) {
            dbg(`- reading cache:    \t${latest}`)
            let content     = (await fs.readFile(path.join(cacheDir, latest))).toString()
            while (!content.match(/^\s*[[{}]/))         // Delete any leading comment lines before JSON
                content     = content.replace(/.*[\r\n]*/, '')
            const obj       = JSON.parse(content)
            return obj
        }
    }
    // Get fresh data
    const obj = await creatorFunc()
    // Write the fresh data to a new cache entry
    const safeTimestamp = startTimestamp.replace(/:/g, '_')     // Windows can't handle ':' in filenames
    const cacheFilename = path.join(cacheDir, `${safeTimestamp}.jsonc`)
    const content       = `//# ${cacheFilename}\n` + JSON.stringify(obj)
    dbg(`- saving cache:    \t${cacheFilename}`)
    if (!options.fake)
        fss.writeFileSync(cacheFilename, content)
    return obj
}

//---------------------------------------------------------------------------------------------------

// Get the Workspace dir for the Fibery domain
function getWorkspace( domain ) {
    workspace = path.join(FIBERY, domain)
    return maybeCreateDir('workspace', workspace)
}

// Get the list of Spaces in the Workspace
async function getSpaces() {
    spaces = await cachify(null, null, 'spaces', async() => {
        const data = await fiberyFetch( '/api/commands?reason=preload&command=fibery.app/get-available-apps', 'POST', '[{"command":"fibery.app/get-available-apps","args":{}}]' )
        assert.ok(data?.length > 0, `Could not read spaces for ${FIBERY_DOMAIN} - check your FIBERY_API_KEY env var`)
        const result = {}
        for (const space of data[0].result) {
            const name = space['app-namespace']
            if (!name.match(/^[a-z]|^Collaboration~Documents/))
                result[name] = { name, id: space['app-id'] }
        }
        assert.ok(Object.keys(result)?.length > 0, `Did not fetch any spaces from ${FIBERY_DOMAIN}`)
        return result
    })
}

// Get the Workspace schema
async function getSchema() {
    const data = await cachify(null, null, 'schema', async() => {
        const data = await fiberyFetch( '/api/commands', 'POST', '[{"command":"fibery.schema/query"}]'  )
        assert.ok(data?.[0]?.success, `Error retrieving schema for ${FIBERY_DOMAIN} - check your FIBERY_API_KEY?`)
        return data
    })
    schema = new FiberyWorkspaceSchema( data[0].result )
    // dbg( Object.entries(schema.spaces).map( ([n,s]) => [ n, s['fibery/id'] ] ) )    // Dump Spaces names and id's
}

// Create a filter function to filter names of Rules/Buttons/Spaces/Types
function makeFilter( pattern, field='name' ) {
    if (!pattern || pattern==='.' || pattern==='*')
        return () => true                                       // match everything
    const negate        = pattern.startsWith('-')               // Start a pattern with '-' to negate it
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

// Generate all Space names that pass the Space name filter
function* spaces_filtered() {
    const filtr = makeFilter( options.space )       // name filter
    yield* Object.values(spaces).filter( filtr )
}

// Generate all Type names in the given space that pass the Type name filter
function* types_filtered( space ) {
    if (!space?.types) return            // Some Spaces might have NO types/DBs defined
    const filtr = makeFilter( options.type )
    yield* Object.values(space.types).filter( filtr )
}

// Generate all Buttons that pass the Button name filter
function* buttons_filtered( buttons ) {
    if (!buttons) return
    const filtr = makeFilter( options.button )      // name filter
    yield* buttons.filter( b => filtr(`${b.name} =${b.id}`) )
}

// Generate all Rules that pass the Rules filter
function* rules_filtered( rules ) {
    if (!rules) return
    const filtr = makeFilter( options.rule )        // name filter
    yield* rules.filter( r => filtr(`${r.name} =${r.id}`) )
}

// Get all Button definitions for a Type
async function getButtonsForType( space, typeId, useCache=false ) {
    const result = await cachify( space, typeId, 'buttons',
        async() => fiberyFetch(`/api/automations/buttons/for-type/${typeId}`, 'GET'), useCache )
    assert.ok(result instanceof Array)
    return result
}

// Get all Rule definitions for a Type
async function getRulesForType( space, typeId, useCache=false ) {
    const result = await cachify( space, typeId, 'rules',
        async() => fiberyFetch(`/api/automations/auto-rules/for-type/${typeId}`, 'GET'), useCache )
    assert.ok(result instanceof Array)
    return result
}

// Update all Button definitions for a Type
async function updateButtonsForType( typeId, buttons ) {
    if (options.fake) return
    const result = await fiberyFetch(`/api/automations/buttons/for-type/${typeId}`, 'PUT', buttons)
    debugger    // Check success??
}

// Update all Rule definitions for a Type
async function updateRulesForType( typeId, rules ) {
    if (options.fake) return
    const result = fiberyFetch(`/api/automations/auto-rules/for-type/${typeId}`, 'PUT', rules)
    debugger    // Check success??
}

// Generate a script's Fibery api header (comment line)
function scriptApiHeader( automationId, actionId ) {
     return `//.fibery SCRIPTID=${automationId} ACTIONID=${actionId}\n`
}

// Generate a script's git header (block comment)
function scriptGitHeader( filePath ) {
    if (options.nogit) return ''
    const cwd       = path.dirname(filePath), filename = path.basename(filePath)
    // const status    = gitStatus(cwd, filename)
    // if (!status) return ''
    let gitlog      = execGitCommandSync(['log', '--decorate', '-n1', '--', filename], {cwd})
    if (gitlog.stderr) {
        warn(gitlog.stderr.toString())
        return ''
    }
    gitlog          = gitlog.toString()
    if (!gitlog) return ''
    // Return a C-style comment block with the git log info
    return '/*.git\n'
        + gitlog.split('\n').map( line => '** '+line ).join('\n')
        + '\n*/\n'
}

const deleteScriptHeaders = (script) => script.replace(/^\/\/.fibery\s+.*[\r\n]+/, '')
                                              .replace(/\/\*.git\b[\s\S]*?\*\/\s*[\r\n]+/, '\n')

// Save a local automation action script
function saveLocalActionScript( automationName, typeDir, automationId, actionId, script ) {
    const filePath   = localScriptPath(automationName, typeDir, automationId, actionId)
    dbg(`  Saving action:      \t${filePath}`)
    if (options.fake) return
    const apiHeader  = scriptApiHeader(automationId, actionId)
    const baseScript = deleteScriptHeaders(script)
    const newScript  = `${apiHeader}\n${baseScript}`
    fss.writeFileSync(filePath, newScript)
}


//---------------------------------------------------------------------------------------------------
// Pull: Get automation script definitions from Fibery Workspace
//
async function pull() {
    await doSetup()
    dbg(`pull - options: ${stringify(options)},\npositionals: ${stringify(positionals)}`)

    for (const space of spaces_filtered()) {
        dbg( `Scanning space:        \t${space.name}\t"${space.id}"` )

        for (const type of types_filtered(space)) {
            dbg(`Scanning DB:        \t${type['fibery/name']} \t${type['fibery/id']}`)
            const typeId = type['fibery/id'], typeDir = getTypeDir(space, typeId)

            if (options.button) {
                for (const automation of buttons_filtered( await getButtonsForType(space, typeId, false) )) {
                    dbg(`Scanning Button: \t${automation.name} \t${automation.id}`)
                    // Check each action for a script
                    for (const action of automation.actions) {
                        if (action.args?.script)
                            saveLocalActionScript(`BUTTON~ ${automation.name}`, typeDir, automation.id, action.id, action.args.script.value)
                    }
                }
            }

            if (options.rule) {
                for (const automation of rules_filtered( await getRulesForType(space, typeId, false) )) {
                    dbg(`Scanning Rule:   \t${automation.name} \t${automation.id}`)
                    // Check each action for a script
                    for (const action of automation.actions) {
                        if (action.args?.script)
                            saveLocalActionScript(`RULE~ ${automation.name}`, typeDir, automation.id, action.id, action.args.script.value)
                    }
                }
            }
        }
    }
}


//---------------------------------------------------------------------------------------------------
// Push: Get automation script definitions from Fibery Workspace
//
async function push() {
    await doSetup()
    dbg(`push - options: ${stringify(options)},\npositionals: ${stringify(positionals)}`)

    // Process matching Spaces
    for (const space of spaces_filtered(workspace)) {
        dbg(    `Scanning space:     \t${space.name}\t"${space.id}"` )
        
        // Process matching Types
        for (const type of types_filtered(space)) {
            dbg(`Scanning DB:        \t${type['fibery/name']}\t"${type['fibery/id']}"`)
            const typeId  = type['fibery/id']
            const typeDir = await getTypeDir(space, typeId)
            
            // Update automation actions from local script files
            function updateActions( automationType, automations ) {
                let   dirtyCount    = 0                                 // How many actions were updated?
                const scriptPrefix  = automationType.match(/button/i) ? 'BUTTON~ ' : 'RULE~ '
                // Check each automation (button/rule) in the Type
                for (const automation of automations) {
                    dbg(`Scanning ${automationType}:    \t${automation.name} \t${automation.id}`)
                    let actionNum   = 0
                    // Check each action in current Automation
                    for (const action of automation.actions) {
                        ++actionNum
                        if (!action?.args?.script) continue             // Ignore this action: not a script
                        const scriptPath = localScriptPath(`${scriptPrefix}${automation.name}`, typeDir, automation.id, action.id)
                        if (!doesPathExist(scriptPath)) {
                            warn(`Local script file not found: ${scriptPath}} -- use \`${thisScriptName} pull\` to get current script definitions from Fibery`)
                            continue
                        }
                        const baseScript = deleteScriptHeaders( fss.readFileSync(scriptPath).toString() )
                        const apiHeader  = scriptApiHeader(automation.id, action.id)
                        const gitHeader  = scriptGitHeader(scriptPath)
                        const newScript  = `${apiHeader}${gitHeader}\n${baseScript}`                 // Add current headers
                        action.args.script.value = newScript               // Update the automation action with the local script
                        dbg(`- pushing action:    \t${scriptPath}`)
                        ++dirtyCount
                    }
                }
                return dirtyCount
            }

            if (options.button) {
                // Process all Buttons in current Type
                const buttons = await getButtonsForType(space, typeId, false)
                if (updateActions('button', buttons)) {
                    log(`Pushing Button actions for DB [${space.name}/${type.name}]`)
                    await updateButtonsForType(typeId, buttons)
                }
                else
                    dbg(` - no actions to update for [${space.name}/${type.name}]`)
            }

            if (options.rule) {
                // Process all Rules in current Type
                const rules = await getRulesForType(space, typeId, false)
                if (updateActions('rule', rules)) {
                    log(`Pushing Rule actions for DB [${space.name}/${type.name}]`)
                    await updateRulesForType(typeId, rules)
                }
                else
                    dbg(` - no actions to update for [${space.name}/${type.name}]`)
            }
        }
    }
}

//---------------------------------------------------------------------------------------------------
// List: List Button/Rule automation scripts
//
async function list() {
    await doSetup()
    dbg(`list - options: ${stringify(options)},\npositionals: ${stringify(positionals)}`)
    debugger
}

//---------------------------------------------------------------------------------------------------
// Purge: Delete cache entries older than {days}
//
async function purge() {
    await doSetup()
    dbg(`purge - options: ${stringify(options)},\npositionals: ${stringify(positionals)}`)
    debugger
}

//---------------------------------------------------------------------------------------------------
// MAIN
//
async function main() {
    try {
        let cmd = positionals.shift()
        switch (cmd || '') {

            case 'list':
                await list()
                break

            case 'pull':
                await pull()
                break

            case 'push':
                await push()
                break
            
            case 'purge':
                await purge()
                break
            
            case 'help':
            case '':
                help( positionals.shift() )
                break

            default:
                error(`Unrecognized command "${cmd}"`)
                help()
                break
        }
    }
    catch (err) {
        if (err.stdout) err.stdout = err.stdout.toString()
        if (err.stderr) err.stderr = err.stderr.toString()
        error(err)
    }
}

main()
.catch( err => error(err) )
.finally( () => { debugger; process.exit(returnCode) } )
