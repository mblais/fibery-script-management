// Manage Fibery Automations remotely
//---------------------------------------------------------------------------------------------------
//TODO:
// git mv, insertGitInfo.sh

const fs                            = require('node:fs/promises')
const path                          = require('node:path')
const assert                        = require('node:assert').strict
const { parseArgs }                 = require('node:util')              // https://nodejs.org/api/util.html#utilparseargsconfig
const childProcess                  = require('node:child_process')

if (process.env.NODE_ENV !== 'production') require('longjohn')      // stack trace debugging support

//---------------------------------------------------------------------------------------------------

const {log, warn}                   = console
let   debug                         = 1
const dbg = (...args) => { if (debug) log(...args) }

//---------------------------------------------------------------------------------------------------

let     workspace, schema, spaces
let     returnCode                  = 0
const   thisScriptName              = path.basename( process.argv[1] )      // Name of this file

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

const doesPathExist  = async (fpath)                => fs.stat(fpath).catch( ()=>null )
const doesDirContain = async (dirPath, fileName)    => doesPathExist(path.join(dirPath, fileName))

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
    init:           { type: 'boolean',               default: false },
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
    // Call fiberyConfig.sh to get additional environment vars for the selected Fibery domain?
    if (!process.env.FIBERY_API_KEY && await fs.stat(configScript).catch(e=>null)) {
        try {
            if (await fs.stat(configScript).catch(e=>null)) {
                const moreEnvVars = execFileSync(configScript, ['-0', FIBERY_DOMAIN ?? '']).toString()
                // Add Fibery env vars to process.env
                for( const line of moreEnvVars.split('\0') ) {
                    const [, name, value] = line.match( /(\w+)=([\S\s]*)/ ) ?? []
                    if (name) process.env[name] = value
                }
            }
        } catch (err) {}
    }
    assert.ok(process.env.FIBERY_API_KEY, `FIBERY_API_KEY env var is not defined for workspace "${FIBERY_DOMAIN}"`)
    
    await getWorkspace(FIBERY_DOMAIN)
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

        case 'push':
            warn(`
${thisScriptName} push
    Push automation definitions to Fibery Workspace
`)
            break

        case 'pull':
            warn(`
${thisScriptName} pull
    Get automation definitions from Fibery Workspace
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
    --space       -s    Space   name filter (case insensitive)
    --type        -t    Type/DB name filter (case insensitive)
    --button      -b    Button  name filter (case insensitive)
    --rule        -r    Rule    name filter (case insensitive)
    --cache       -c    Use existing cached info instead querying Fibery API
    --nogit       -g    Don't use git (not tracked)
    --init              Create any missing directories for Spaces and Types
    --fake        -f    Dry run: don't actually change or write anything
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

// Execute a subprocess
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
async function maybeCreateDir( type, dir ) {
    if ( ! await doesPathExist(dir) ) {
        if (!options.init)
            error(`Missing ${type} dir "${dir}" - Use the \`--init\` option to create it automatically`)
        warn(`Creating ${type} dir: "${dir}"`)
        if (!options.fake)
            await fs.mkdir(dir, {recursive: true})
    }    
    return dir
}    

// Check whether a file/dir should be renamed (i.e. it was found by its Id but with a different name)
async function maybeRename( typeDescription, oldPath, newPath ) {
    if (!oldPath || oldPath===newPath) return newPath
    //TODO: check with user, and maybe rename the dir to the new name
    dbg(`Rename:\t${typeDescription}     \t"${oldPath}" \t"${newPath}"`)
    if (options.fake) return oldPath
    if (options.nogit) {
        // Regular OS rename
        await fs.rename(oldPath, newPath)
        return newPath
    } else {
        // Rename using `git mv`
        let gitmv = execFileSync('git', ['mv', oldPath, newPath], {cwd: workspace})
        if (gitmv.message) {
            warn('git mv: ' + gitmv.message)
            return oldPath
        }
        if (gitmv) dbg(gitmv)
        return newPath
    }
}

// Find an existing Space dir by its Id
async function findSpaceDir_byId( spaceId ) {
    const allSpaces = path.join(FIBERY, FIBERY_DOMAIN)
    const token     = `.${spaceId}.space`      // The space should contain this token file
    for (const fname of (await fs.readdir(allSpaces).catch( ()=>[] )) ) {
        const dir   = path.join(allSpaces, fname)
        if (await doesDirContain(dir, token))
            return dir
    }
    return null
}

// Find an existing Type dir by its Id
async function findTypeDir_byId( spaceDir, typeId ) {
    const token     = `.${typeId}.type`      // The space should contain this token file
    for (const fname of (await fs.readdir(spaceDir).catch( ()=>[] )) ) {
        const dir   = path.join(spaceDir, fname)
        if (await doesDirContain(dir, token))
            return dir
    }
    return null
}

// Does the specified file match the supplied regex/string pattern?
async function testFileContentMatch( filePath, pattern ) {
    if (!doesPathExist(filePath)) return null
    const content = (await fs.readFile(filePath)).toString()
    return content.match(pattern)
}

// Find an existing script file by its header line
async function find_scriptFile_byHeader( typeDir, probableFilePath, header ) {
    // Test the guessed filePath first
    if (await testFileContentMatch(probableFilePath, header).catch(()=>null))
        return probableFilePath
    // Look for any script file in typeDir that contains the specified header line
    const ext = path.extname(probableFilePath)
    for (const fname of (await fs.readdir(typeDir).catch( ()=>[] )) ) {
        if (!fname.endsWith(ext)) continue              // filter out cache subdirs
        const filePath = path.join(typeDir, fname)
        if (await testFileContentMatch(filePath, header).catch(()=>null))
            return filePath
    }
    return null
}

// Get the dir for the given Space
async function getSpaceDir( space=null ) {
    if (!space) return path.join( FIBERY, FIBERY_DOMAIN, '.fibery')
    let dir = path.join(FIBERY, FIBERY_DOMAIN)
    const currentDirName = `SPACE ${space.name}`        // This is what the dirName should be
    dir                  = path.join(dir, currentDirName)
    const foundDir       = await findSpaceDir_byId(space.id)
    if ( !foundDir )
        return maybeCreateDir('space', dir)
    // Found by Id - has the dir name changed?
    const foundDirName   = path.basename(foundDir)
    dir = await maybeRename('space', foundDir, dir)
    return dir
}

// Get the dir for the given Space + Type
async function getTypeDir( space, typeId ) {
    const spaceDir       = await getSpaceDir(space)
    if (!typeId) return spaceDir
    const typeName       = typeName_from_typeId(typeId)
    const currentDirName = `DB ${typeName}`             // This is what the dirName should be
    let dir              = path.join(spaceDir, currentDirName)
    const foundDir       = await findTypeDir_byId(spaceDir, typeId)
    if ( !foundDir )
        return maybeCreateDir('DB', dir)
    // Found by Id - has the dir name changed?
    const foundDirName   = path.basename(foundDir)
    dir = await maybeRename('DB', foundDir, dir)
    return dir
}

// Get the dir for a Space + Type + cacheType
async function getCacheDir( space, typeId, cacheType ) {
    const dir = path.join( await getTypeDir(space, typeId), `.${cacheType}`)
    return maybeCreateDir(cacheType, dir)
}


//---------------------------------------------------------------------------------------------------
// Manage caches
//

// Get some cached or fresh data (JSON)
async function cachify( space, typeId, cacheType, creatorFunc, useCache=true ) {
    const cacheDir          = await getCacheDir(space, typeId, cacheType)
    if (options.cache && useCache) {
        // Use cached data if available
        const cacheFiles    = await fs.readdir(cacheDir)
        // Cache filenames are a timestamp of when they were created
        const latest        = cacheFiles.filter( name => name.match(/^\d\d\d\d-\d\d-\d\d \d\d.\d\d.\d\d.*\.jsonc$/) )
            .sort().slice(-1)[0]                        // Most-recently-created cache file
        if (latest) {
            dbg(` - reading cache:    \t${latest}`)
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
    dbg(` - saving cache:    \t${cacheFilename}`)
    if (!options.fake)
        await fs.writeFile(cacheFilename, content)
    return obj
}

//---------------------------------------------------------------------------------------------------

// Get the Workspace dir
async function getWorkspace( domain ) {
    workspace = path.join(FIBERY, domain)
    maybeCreateDir('workspace', workspace)
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
    return pattern.startsWith('/') ?
            makeReFilter( pattern.substr(1).replace(/\/$/, ''), field )          // Regex
          : makeReFilter( `^${pattern.replace(/([*?])/g, '.$1')}$`, field )      // Glob
}

// Generate all Space names that pass the Spaces filter
function* spaces_filtered( workspace ) {
    const filtr = makeFilter( options.space )
    yield* Object.values(spaces).filter( filtr )
}

// Generate all Type names (in the given space) that pass the Types filter
function* types_filtered( space ) {
    if (!space?.types) return           // Some Spaces might have NO types/DBs defined
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

// Make the Fibery api header for a script file
function scriptApiHeader( automationId, actionId ) {
     return `//.fibery SCRIPTID=${automationId} ACTIONID=${actionId}`
}

// function gitStatus( cwd, filename ) {
//     let gitstatus = execFileSync('git', ['status', '--short', '--porcelain', filename], {cwd})
//     if (gitstatus.stderr) {
//         warn(gitstatus.stderr.toString())
//         return null
//     }
//     return gitstatus.toString()
// }

// Build the git header comment for a script file
async function scriptGitHeader( filePath ) {
    if (options.nogit) return ''
    const cwd       = path.dirname(filePath), filename = path.basename(filePath)
    // const status    = gitStatus(cwd, filename)
    // if (!status) return ''
    let gitlog      = execFileSync('git', ['log', '--decorate', '-n1', '--', filename], {cwd})
    if (gitlog.stderr) {
        warn(gitlog.stderr.toString())
        return ''
    }
    gitlog          = gitlog.toString()
    if (!gitlog) return ''
    return '/*.git\n'
        + gitlog.split('\n').map( line => '** '+line ).join('\n')
        + '\n*/\n'
}

// Save a Button or Rule action script locally
async function saveAutomationScript( automationName, typeDir, automationId, actionId, scriptsCount, script ) {
    const apiHeader     = scriptApiHeader(automationId, actionId)
    const scriptExt     = scriptsCount>1 ? ` ~${actionId.slice(-4)}` : ''                // To differentiate multiple scripts within the same Automation
    let   newFile       = path.join(typeDir, `${automationName}${scriptExt}.js`)        // What the script filename SHOULD be
    const existingFile  = await find_scriptFile_byHeader(typeDir, newFile, apiHeader)
    newFile             = await maybeRename('script', existingFile, newFile)
    // const gitHeader     = await scriptGitHeader(newFile)
    dbg(`Saving script:      \t${newFile}`)
    script = script.replace(/^\/\/.fibery\s+.*[\r\n]+/, '' )                // Delete old script headers
    //            .replace(/\/\*.git\b[\s\S]*?\*\/\s*/)
    // script = `${apiHeader}\n${gitHeader}\n${script}`
    script = `${apiHeader}\n${script}`
    if (!options.fake)
        await fs.writeFile(newFile, script)
}

//---------------------------------------------------------------------------------------------------
// Pull: Get automation script definitions from Fibery Workspace
//
async function pull( cmd ) {
    await doSetup()
    dbg(`pull(${cmd})\noptions: ${stringify(options)},\npositionals: ${stringify(positionals)}`)

    for (const space of spaces_filtered(workspace)) {
        dbg( `Scanning space:        \t${space.name}\t"${space.id}"` )

        for (const type of types_filtered(space)) {
            dbg(`Scanning DB:        \t${type['fibery/name']}\t"${type['fibery/id']}"`)
            const typeId  = type['fibery/id']
            const typeDir = await getTypeDir(space, typeId)

            if (options.button) {
                const buttons = await getButtonsForType(space, typeId, false)
                for (const button of buttons_filtered(buttons)) {
                    const scriptsCount = button.actions.filter( action => action.args.script?.value ).length  // How many script actions?
                    // Check each Action for scripts
                    dbg(`Scanning Button: \t${button.name} \t${button.id}`)
                    for (const action of button.actions) {
                        const script = action?.args?.script?.value
                        if (script==null) continue                   // Ignore this action if it's not a script
                        await saveAutomationScript(`BUTTON~ ${button.name}`, typeDir, button.id, action.id, scriptsCount, script)
                    }
                }
            }

            if (options.rule) {
                const rules = await getRulesForType(space, typeId, false)
                for (const rule of rules_filtered(rules)) {
                    const scriptsCount = rule.actions.filter( action => action.args.script?.value ).length  // How many script actions?
                    // Check each Action for scripts
                    dbg(`Scanning Rule:   \t${rule.name} \t${rule.id}`)
                    for (const action of rule.actions) {
                        const script = action?.args?.script?.value
                        if (script==null) continue                   // Ignore this action if it's not a script
                        await saveAutomationScript(`RULE~ ${rule.name}`, typeDir, rule.id, action.id, scriptsCount, script)
                    }
                }
            }
        }
    }
}


//---------------------------------------------------------------------------------------------------
// Push: Get automation script definitions from Fibery Workspace
//
async function push( cmd ) {
    await doSetup()
    dbg(`push(${cmd})\noptions: ${stringify(options)},\npositionals: ${stringify(positionals)}`)

    for (const space of spaces_filtered(workspace)) {
        dbg( `Scanning space:        \t${space.name}\t"${space.id}"` )

        for (const type of types_filtered(space)) {
            dbg(`Scanning DB:        \t${type['fibery/name']}\t"${type['fibery/id']}"`)
            const typeId  = type['fibery/id']
            const typeDir = await getTypeDir(space, typeId)

            if (options.button) {
                const buttons = await getButtonsForType(space, typeId, false)
                for (const button of buttons_filtered(buttons)) {
                    // Check each Button Action for scripts
                    dbg(`Scanning Button: \t${button.name}`)
                    for (const action of button.actions) {
                        const script = action?.args?.script?.value
                        if (script==null) continue                   // Ignore this action if it's not a script
                        await saveAutomationScript(`BUTTON~ ${button.name}`, typeDir, button.id, action.id, script)
                    }
                }
            }

            if (options.rule) {
                const rules = await getRulesForType(space, typeId, false)
                for (const rule of rules_filtered(rules)) {
                    // Check each Rule Action for scripts
                    dbg(`Scanning Rule:   \t${rule.name}`)
                    for (const action of rule.actions) {
                        const script = action?.args?.script?.value
                        if (script==null) continue                   // Ignore this action if it's not a script
                        await saveAutomationScript(`RULE~ ${rule.name}`, typeDir, rule.id, action.id, script)
                    }
                }
            }
        }
    }
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
                await purge(cmd)
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
