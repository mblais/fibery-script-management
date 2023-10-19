// Manage Fibery Automations remotely
//---------------------------------------------------------------------------------------------------

const fs                            = require('node:fs')
const path                          = require('node:path')
const assert                        = require('node:assert').strict
const { parseArgs }                 = require('node:util')              // https://nodejs.org/api/util.html#utilparseargsconfig
const { execFileSync }              = require('node:child_process')

//---------------------------------------------------------------------------------------------------

const {log, warn}                   = console
let   debug                         = 1
const dbg = (...args) => { if (debug) log(...args) }

//---------------------------------------------------------------------------------------------------

let     returnCode = 0
let     schema
let     spaces

//---------------------------------------------------------------------------------------------------

const stringify = (arg) => JSON.stringify(arg,null,2)

const timestamp = ( d=null ) => (d ?? new Date()).toLocaleString('sv', {year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric', second:'numeric', fractionalSecondDigits: 3}).replace(',', '.').replace(' ', '_')  // timeZone:"America/Los_Angeles"

function error(...args) {
    console.error(...args)
    if (!returnCode) returnCode = 1
    debugger
}

//---------------------------------------------------------------------------------------------------
// Setup

// Parse command line options
const commandLineOptions = {
    domain: { type: 'string',   short: 'd',                 },     // FIBERY_DOMAIN
    space:  { type: 'string',   short: 's',  default: '*'   },
    type:   { type: 'string',   short: 't',  default: '*'   },
    button: { type: 'string',   short: 'b',                 },
    rule:   { type: 'string',   short: 'r',                 },
    cached: { type: 'boolean',  short: 'c',  default: false },
}
const args = process.argv.slice(2)
const {values: options, positionals} = parseArgs({ args, options: commandLineOptions, allowPositionals: true })
if( options.domain ) process.env.FIBERY_DOMAIN = options.domain
const fiberyDomain = process.env.FIBERY_DOMAIN
const FIBERY = process.env.FIBERY

async function doSetup() {
    // Validate inputs
    assert.ok( FIBERY, 'FIBERY env var should hold the path to the dir for Fibery domains' )
    // assert.doesNotMatch( FIBERY, /[;:<>|$`]/, `dangerous shell characaters in FIBERY env var: ${FIBERY}` )

    // Call fiberyConfig.sh to get additional environment vars for the selected Fibery domain
    const cfg = path.join(FIBERY, 'fiberyConfig.sh')
    if (!process.env.FIBERY_API_KEY && fs.statSync(cfg)) {
        const moreEnvVars = execFileSync(cfg, ['-0', fiberyDomain ?? '']).toString()
        // Add Fibery env vars to process.env
        for( const line of moreEnvVars.split('\0') ) {
            const [, name, value] = line.match( /(\w+)=([\S\s]*)/ ) ?? []
            if (name) process.env[name] = value
        }
    }

    assert.ok(fiberyDomain, `Fibery workspace domain must be defined either by FIBERY_DOMAIN env var or --domain arg`)
    if (!fs.statSync( path.join(FIBERY, fiberyDomain)))
        error(`Domain directory "${fiberyDomain}" does not exist in ${FIBERY}`)

    await getWorkspaceSpaces()
    await getWorkspaceSchema()
}

// Dump Fibery env vars:
// dbg( Object.fromEntries( Object.keys(process.env).filter( k => k.match(/fibery/i) ).map( k => [k, process.env[k]] ) ) )

function help( cmd ) {
    const exe = path.basename( process.argv[1] )
    switch (cmd) {
        case 'push':
            error(`
${exe} push
    Push automation definitions to Fibery Workspace
`)
            break
        case 'pull':
            error(`
${exe} pull
    Get automation definitions from Fibery Workspace
`)
            break

        default:
            error(`
${exe} - Manage Fibery Automations remotely
Usage: ${exe} [ help | list | pull | push ]
    --domain    -d      Fibery domain, e.g. example.fibery.io
    --space     -s      Space   name filter
    --type      -t      Type/DB name filter
    --button    -b      Button  name filter
    --rule      -r      Rule    name filter
    --cached    -c      Use cached Workspace info

Required environment variables:
    FIBERY              Path to the Fibery domains directory
    FIBERY_API_KEY      Get one from Fibery: Setings > API Keys
`)
    }
    returnCode = 1
}

async function fiberyFetch( url, method, data=null ) {
    const body = data ? { body: (data instanceof Object ? JSON.stringify(data) : data) }
                      : null
    const response = await fetch( `https://${fiberyDomain}${url}`, {
        method,         // *GET, POST, PUT, DELETE, etc.
        headers: {
            'Content-Type':  'application/json; charset=utf-8',
            'Authorization': `Token ${process.env.FIBERY_API_KEY}`,
        },
        ...body
    })
    return response.json()
}

class FiberyWorkspaceSchema {
    constructor( schemaRaw ) {
        this.types = Object.fromEntries( schemaRaw['fibery/types']
            .filter( t => !( t['fibery/deleted?'] || t['fibery/meta']?.['fibery/enum?'] ||
                             t['fibery/name'].match(/^[a-z]|^Files\/|^Collaboration~Documents\//) ))
            .map(    t =>   [t['fibery/name'], t] ) )
        this.spaces         = {}
        this.fieldsById     = {}

        // Spaces and Types
        for (const [typeName, type] of Object.entries(this.types)) {
            const  [,sName, tName]  = typeName.match( /(.*)\/(.*)/ )
            type.name               = tName
            this.spaces[sName]    ??= { name: sName, types: {} }
            this.spaces[sName].types[typeName] = type
        }

        // // Fields
        // for (    const space of Object.values(this.spaces)) {
        //     for (const type  of Object.values(space.types)) {
        //         type.fields ??= {}
        //         for (const field of type['fibery/fields']) {
        //             const fieldName          = field['fibery/name'], fieldId = field['fibery/id']
        //             this.fieldsById[fieldId] = field
        //             type.fields[fieldName]   = field
        //         }
        //     }
        // }
    }
}

// Get Workspace schema
async function getWorkspaceSchema() {
    const data = await fiberyFetch( '/api/commands', 'POST', '[{"command":"fibery.schema/query"}]' )
    schema = new FiberyWorkspaceSchema( data[0].result )
    dbg( Object.entries(schema.spaces).map( ([n,s]) => [ n, s['fibery/id'] ] ) )
}

// Get Workspace Spaces
async function getWorkspaceSpaces() {
    const data = await fiberyFetch( '/api/commands?reason=preload&command=fibery.app/get-available-apps', 'POST', '[{"command":"fibery.app/get-available-apps","args":{}}]' )
    spaces = {}
    for (const s of data[0].result) {
        const name   = s['app-namespace'], id = s['app-id']
        spaces[name] = { id }
    }
}

// Get Buttons for type
async function getButtonsForType(typeId) {
    return await fiberyFetch(`/api/automations/buttons/for-type/${typeId}`, 'GET')
}

// Get Rules for type
async function getRulesForType(typeId) {
    return await fiberyFetch(`/api/automations/auto-rules/for-type/${typeId}`, 'GET')
}

// Create a function to filter names (from a command line option)
function makeFilter( pattern, field='name' ) {
    if (pattern==='.' || pattern==='*')
        return () => true                                                       // match everything
    const negate = pattern.startsWith('-')
    if (negate) pattern = pattern.substr(1)
    const makeReFilter = (pat, field) => { 
        const re = new RegExp(pat, 'i')
        return negate ? (obj) => !re.exec(obj[field]) : (obj) => !!re.exec(obj[field])
    }
    if (pattern.startsWith('/'))
        return makeReFilter( pattern.substr(1).replace(/\/$/, ''), field )             // Regex
    else
        return makeReFilter( '^' + pattern.replace(/([*?])/g, '.$1') + '$', field )    // Glob
}

// Generate all space names that pass the spaces filter
function* spaces_filtered() {
    const filtr = makeFilter( options.space )
    yield* Object.values(schema.spaces).filter( filtr )
}

// Generate all type names in the given space that pass the types filter
function* types_filtered( space ) {
    const filtr = makeFilter( options.type )
    yield* Object.values(space.types).filter( filtr )
}

//---------------------------------------------------------------------------------------------------

// Pull: get automation definitions from Workspace
async function pull( cmd ) {
    await doSetup()
    dbg(`pull(${cmd})\noptions: ${stringify(options)},\npositionals: ${stringify(positionals)}`)
    for (const space of spaces_filtered()) {
        dbg( `\nSpace: ${space.name}` )
        for (const type of types_filtered(space)) {
            dbg(`\n  Type: "${type['fibery/name']}"\t ${type['fibery/id']}`)
            const typeId = type['fibery/id']
            if (options.button) {
                // Get Buttons for type
                const buttons = await getButtonsForType(typeId)
                const buttonFilter = makeFilter(options.button)
                for (const button of buttons.filter(buttonFilter)) {
                    dbg(`    Button:\t ${button.id}\t "${button.name}"`)
                }
            }
            if (options.rule) {
                // Get Rules for type
                const rules = await getRulesForType(typeId)
                const ruleFilter = makeFilter(options.rule)
                for (const rule of rules.filter(ruleFilter)) {
                    dbg(`    Rule:\t ${rule.id}\t "${rule.name}"`)
                }
            }
        }
    }
}

// Update Workspace automations from local files
async function push( cmd ) {
    await doSetup()
    dbg(`push(${cmd})\noptions: ${stringify(options)},\npositionals: ${stringify(positionals)}`)
}

//---------------------------------------------------------------------------------------------------
// MAIN
async function main() {
    try {
        let cmd = positionals.shift()
        switch (cmd) {
            case 'pull':
                await pull(cmd)
                break

            case 'push':
                await push(cmd)
                break
            
            case 'help':
                help( positionals.shift() )
                break

            default:
                help()
        }
    }
    catch (err) {
        if (err.stdout) err.stdout = err.stdout.toString()
        if (err.stderr) err.stderr = err.stderr.toString()
        throw err
    }
}

// module.exports = {
//     pushPull
// }

main()
.catch( err => error(err) )
.finally( () => { debugger; process.exit(returnCode) } )
