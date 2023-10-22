// Manage Fibery Automations remotely
//---------------------------------------------------------------------------------------------------

const fs                            = require('node:fs/promises')
const path                          = require('node:path')
const assert                        = require('node:assert').strict
const { parseArgs }                 = require('node:util')              // https://nodejs.org/api/util.html#utilparseargsconfig
const { execFileSync }              = require('node:child_process')

//---------------------------------------------------------------------------------------------------

const {log, warn}                   = console
let   debug                         = 1
const dbg = (...args) => { if (debug) log(...args) }

//---------------------------------------------------------------------------------------------------

let     returnCode                  = 0
let     schema
let     result
const   scriptName                  = path.basename( process.argv[1] )      // Name of this file

//---------------------------------------------------------------------------------------------------

const stringify = (arg) => JSON.stringify(arg,null,2)

const timestamp = ( d=null ) => (d ?? new Date()).toLocaleString('sv', {year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric', second:'numeric', fractionalSecondDigits: 3}).replace(',', '.')
const startTimestamp = timestamp()

function error(...args) {
    // if (typeof args[0]==='string') args[0] = `${exe}: ${args[0]}`
    // if (args[0] instanceof Error)
    console.error(...args)
    if (!returnCode) returnCode = 1
    debugger
}

async function doesPathExist(dir) {
    const result = await fs.stat(dir).catch( ()=>null )
    return result
}

//---------------------------------------------------------------------------------------------------
// Setup

// Parse command line options
const commandLineOptions = {
    domain:         { type: 'string',   short: 'd',                 },     // FIBERY_DOMAIN
    space:          { type: 'string',   short: 's',  default: '*'   },
    type:           { type: 'string',   short: 't',  default: '*'   },
    button:         { type: 'string',   short: 'b',                 },
    rule:           { type: 'string',   short: 'r',                 },
    cached:         { type: 'boolean',  short: 'c',  default: false },
    init:           { type: 'boolean',                              },
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
    assert.ok( FIBERY, 'FIBERY env var should hold the path to the dir for Fibery domains' )
    // assert.doesNotMatch( FIBERY, /[;:<>|$`]/, `dangerous shell characaters in FIBERY env var: ${FIBERY}` )

    // Call fiberyConfig.sh to get additional environment vars for the selected Fibery domain
    const cfg = path.join(FIBERY, 'fiberyConfig.sh')
    if (!process.env.FIBERY_API_KEY && await fs.stat(cfg)) {
        const moreEnvVars = execFileSync(cfg, ['-0', FIBERY_DOMAIN ?? '']).toString()
        // Add Fibery env vars to process.env
        for( const line of moreEnvVars.split('\0') ) {
            const [, name, value] = line.match( /(\w+)=([\S\s]*)/ ) ?? []
            if (name) process.env[name] = value
        }
    }

    assert.ok(FIBERY_DOMAIN, `Fibery workspace domain must be defined either by FIBERY_DOMAIN env var or --domain arg`)
    if (!await fs.stat( path.join(FIBERY, FIBERY_DOMAIN)))
        error(`Domain directory "${FIBERY_DOMAIN}" does not exist in ${FIBERY}`)

    await getWorkspaceSpaces()
    await getWorkspaceSchema()
}

// Dump Fibery env vars:
// dbg( Object.fromEntries( Object.keys(process.env).filter( k => k.match(/fibery/i) ).map( k => [k, process.env[k]] ) ) )

function help( cmd ) {
    switch (cmd || '') {

        case 'list':
            warn(`
${scriptName} list
    List automation definitions
`)
            break

        case 'push':
            warn(`
${scriptName} push
    Push automation definitions to Fibery Workspace
`)
            break

        case 'pull':
            warn(`
${scriptName} pull
    Get automation definitions from Fibery Workspace
`)
            break

        case 'purge {days}':
            warn(`
${scriptName} purge
    Purge cache entries older than {days}
`)
            break

        case '':
            warn(`
${scriptName} - Manage Fibery Automations scripts remotely

Usage:  ${scriptName}  [ help {cmd} | list | pull | push | purge ]  [ options... ]

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
    --cached      -c    Use last cached info (if available) instead querying Fibery
    --init              Create any missing directories for Spaces and Types
    --verbose     -v    Verbose output

NAME FILTERS:

    Name filters (for Space/Type/Button.Rule) are glob-like, or regex if preceded by '/'.
    A filter is negated if the first character is '-'.

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
            result[sName].types   ??= this.spaces[sName].types
        }
    }
}

const typeName_from_typeId      = (typeId)    => Object.values(schema.types).find( t => t['fibery/id']===typeId )?.name
const spaceId_from_spaceName    = (spaceName) => spaces[spaceName].id

//---------------------------------------------------------------------------------------------------
// Manage caches
//

// Look in a containing dir for a file/subdir whose name includes the given id
async function findPathById( containingDir, id ) {
    assert.ok(typeof containingDir==='string')
    // Return the name of the found file/dir, or the new name
    const files = await fs.readdir(containingDir).catch(()=>null)
    if (!files) return null
    return files.find( dirName => dirName.indexOf(id) >= 0 )
}

// Get the cache dir for a Space
async function getSpaceDir( spaceName=null ) {
    let dir = path.join(FIBERY, FIBERY_DOMAIN)
    if (spaceName) {
        dir = path.join(dir, 'SPACE')
        const spaceId   = spaceId_from_spaceName(spaceName)
        const name      = `${spaceName} =${spaceId}`
        let   spaceDir  = await findPathById( dir, spaceId )
        if (!spaceDir) {
            // Not found
            spaceDir    = name
        } else if (spaceDir!==name) {
            // Right Id, but different name - was Space renamed in Fibery?
            // const oldSpaceName = path.basename(spaceDir).replace(/ = .*/, '')
            warn(`Fibery Space was renamed? Use \`git mv '${spaceDir}' '${name}'\` to update local dir name to match`)
        }
        dir = path.join(dir, spaceDir)
    }
    return dir
}

// Get the cache dir for a Space + Type
async function getTypeDir( spaceName, typeId ) {
    let dir = await getSpaceDir(spaceName)
    if (typeId) {
        const typeName      = typeName_from_typeId(typeId).replace(/.*\//, '')
        const name          = `${typeName} =${typeId}`
        let   typeDir       = await findPathById( dir, typeId )
        if (!typeDir) {
            // Not found
            typeDir         = name
        } else if (typeDir!==name) {
            // Right Id, but different name - was Type renamed in Fibery?
            const oldTypeName = path.basename(typeDir).replace(/ = .*/, '')
            warn(`Was Fibery ${spaceName} Type "${oldTypeName}" renamed to "${typeName}"? Use \`git mv\` to rename local dir to match.`)
        }
        dir                 = path.join(dir, typeDir)
    }
    return dir
}

// Get a cache dir within a Space + Type
async function getCacheDir(spaceName, typeId, cacheName) {
    const dir = path.join( await getTypeDir(spaceName, typeId), '.'+cacheName )
    if ( ! await doesPathExist(dir) ) {
        if (options.init) {
            log(`Creating "${dir}"`)
            await fs.mkdir(dir, {recursive: true})
        } else 
            error(`Missing dir "${dir}" - Use the \`--init\` option to create it automatically`)
    }
    return dir
}

// Get some cached or fresh data
async function cachify( spaceName, typeId, cacheName, creatorFunc, useCache=true ) {
    const cacheDir          = await getCacheDir(spaceName, typeId, cacheName)
    if (options.cached && useCache) {
        // Use cached data if available
        const cacheFiles    = await fs.readdir(cacheDir)
        // Cache filenames are a timestamp of when they were created
        const latest        = cacheFiles.sort().slice(-1)[0]     // Most-recently-created cache file
        if (latest) {
            const content   = await fs.readFile(latest)
            while (!content.match(/^\s*[[{}]/)) content = content.replace(/.*[\r\n]*/, '')   // Delete leading comment lines before JSON
            const obj       = JSON.parse(content)
            return obj
        }
    }
    // Get fresh data
    const obj = await creatorFunc()
    // Write the fresh data to a new cache entry
    const cacheFilename = path.join(cacheDir, `${startTimestamp}.jsonc`)
    const content       = `//# ${cacheFilename}\n` + stringify(obj)
    await fs.writeFile(cacheFilename, content)
    return obj
}

//---------------------------------------------------------------------------------------------------

// Get the list of Spaces
async function getWorkspaceSpaces() {
    spaces = await cachify(null, null, 'spaces', async() => {
        const data = await fiberyFetch( '/api/commands?reason=preload&command=fibery.app/get-available-apps', 'POST', '[{"command":"fibery.app/get-available-apps","args":{}}]' )
        assert.ok(data?.length > 0)
        result = {}
        for (const s of data[0].result) {
            const name = s['app-namespace']
            if (!name.match(/^[a-z]|^Collaboration~Documents/))
                result[name] = { id: s['app-id'], name }
        }
        return result
    })
    assert.ok(Object.keys(spaces)?.length > 0)
}

// Get the Workspace schema
async function getWorkspaceSchema() {
    const data = await cachify(null, null, 'schema',
        () => fiberyFetch( '/api/commands', 'POST', '[{"command":"fibery.schema/query"}]' ))
    assert.ok(data?.[0]?.success)
    schema = new FiberyWorkspaceSchema( data[0].result )
    // dbg( Object.entries(schema.spaces).map( ([n,s]) => [ n, s['fibery/id'] ] ) )    // Dump Spaces names and id's
}

// Make a filter function to filter names of Rules/Buttons/Spaces/Types
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
    if (pattern.startsWith('/'))
        return makeReFilter( pattern.substr(1).replace(/\/$/, ''), field )          // Regex
    else
        return makeReFilter( `^${pattern.replace(/([*?])/g, '.$1')}$`, field )      // Glob
}

// Generate all Space names that pass the Spaces filter
function* spaces_filtered() {
    const filtr = makeFilter( options.space )
    yield* Object.values(result).filter( filtr )
}

// Generate all Type names (in the given space) that pass the Types filter
function* types_filtered( space ) {
    if (!space?.types) return           // Some Spaces have no types/DBs defined
    const filtr = makeFilter( options.type )
    yield* Object.values(space.types).filter( filtr )
}

// Generate all Buttons that pass the Buttons filter
function* buttons_filtered( buttons ) {
    if (!buttons) return
    const filtr = makeFilter( options.button )
    yield* buttons.filter( b => filtr(`${b.name} =${b.id}`) )
}

// Generate all Rules that pass the Rules filter
function* rules_filtered( rules ) {
    if (!rules) return
    const filtr = makeFilter( options.rule )
    yield* rules.filter( r => filtr(`${r.name} =${r.id}`) )
}

// Get all Button definitions for a Type
async function getButtonsForType( space, typeId, useCache=false ) {
    const result = await cachify( space.name, typeId, 'buttons',
        async() => fiberyFetch(`/api/automations/buttons/for-type/${typeId}`, 'GET'), useCache )
    assert.ok(result instanceof Array)
    return result
}

// Get all Rule definitions for a Type
async function getRulesForType( space, typeId, useCache=false ) {
    const result = await cachify( space.name, typeId, 'rules',
        async() => fiberyFetch(`/api/automations/auto-rules/for-type/${typeId}`, 'GET'), useCache )
    assert.ok(result instanceof Array)
    return result
}

// Save a Button or Rule action script locally
async function saveAutomationScript( automationName, typeDir, automationId, actionId, script ) {
    const Ids   = `=${automationId} =${actionId}`
    let   fname = `${automationName} ${Ids}.js`
    const existingFile = await findPathById(typeDir, Ids)
    if (existingFile && existingFile!==fname) {
        warn(`Fibery automation was renamed? Use \`git mv '${existingFile}' '${fname}'\` to rename the local file to match the new name`)
        fname = existingFile
    }
    const fpath = path.join(typeDir, fname)
    dbg(`Writing script: ${fpath}`)
    script = script.replace(/^\/\/# .*[\r\n]+/, '' )    // Replace script header
    script = `//# ${fpath}\n\n${script}`
    await fs.writeFile(fpath, script)
}

//---------------------------------------------------------------------------------------------------
// Pull: Get automation script definitions from Fibery Workspace
//
async function pull( cmd ) {
    await doSetup()
    dbg(`pull(${cmd})\noptions: ${stringify(options)},\npositionals: ${stringify(positionals)}`)

    for (const space of spaces_filtered()) {
        dbg( `Space:\t"${space.name}"\t${space.id}` )

        for (const type of types_filtered(space)) {
            dbg(`Type:\t"${type['fibery/name']}"\t${type['fibery/id']}`)
            const typeId  = type['fibery/id']
            const typeDir = await getTypeDir(space.name, typeId)

            if (options.button) {
                const buttons = await getButtonsForType(space, typeId, false)
                for (const button of buttons_filtered(buttons)) {
                    // Check each Button Action for scripts
                    for (const action of button.actions) {
                        const script = action?.args?.script?.value
                        if (script==null) continue                   // Ignore this action if it's not a script
                        await saveAutomationScript(`BUTTON ${button.name}`, typeDir, button.id, action.id, script)
                    }
                }
            }

            if (options.rule) {
                const rules = await getRulesForType(space, typeId, false)
                for (const rule of rules_filtered(rules)) {
                    // Check each Rule Action for scripts
                    for (const action of rule.actions) {
                        const script = action?.args?.script?.value
                        if (script==null) continue                   // Ignore this action if it's not a script
                        await saveAutomationScript(`RULE ${rule.name}`, typeDir, rule.id, action.id, script)
                    }
                }
            }
        }
    }
}

//---------------------------------------------------------------------------------------------------
// Push: Update Fibery Workspace automation script definitions from local files
//
async function push( cmd ) {
    await doSetup()
    dbg(`push(${cmd})\noptions: ${stringify(options)},\npositionals: ${stringify(positionals)}`)
    debugger
}

//---------------------------------------------------------------------------------------------------
// List: List Button/Rule automation scripts
//
async function list( cmd ) {
    await doSetup()
    dbg(`list(${cmd})\noptions: ${stringify(options)},\npositionals: ${stringify(positionals)}`)
    debugger
}

//---------------------------------------------------------------------------------------------------
// Purge: Delete cache entries older than {days}
//
async function purge( cmd ) {
    await doSetup()
    dbg(`purge(${cmd})\noptions: ${stringify(options)},\npositionals: ${stringify(positionals)}`)
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
                await list(cmd)
                break

            case 'pull':
                await pull(cmd)
                break

            case 'push':
                await push(cmd)
                break
            
            case 'purge':
                await push(cmd)
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

// module.exports = { }

main()
.catch( err => error(err) )
.finally( () => { debugger; process.exit(returnCode) } )
