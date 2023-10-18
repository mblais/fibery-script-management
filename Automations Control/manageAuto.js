// Manage Fibery Automations remotely

const fs                            = require('node:fs')
const path                          = require('node:path')
const assert                        = require('node:assert').strict
const { parseArgs }                 = require('node:util')              // https://nodejs.org/api/util.html#utilparseargsconfig
const { execFileSync }              = require('node:child_process')

const {log,warn,error}              = console

// Parse command line options
const commandLineOptions = {
    domain: { type: 'string' },     // FIBERY_DOMAIN
    // bar: { type: 'string',   short: 'b' },
}
// const args = [ '--domain', 'jrp.fibery.io', 'pos1', 'pos2' ]   // Test args for parseArgs
const args = process.argv.slice(2)
const {values: options, positionals} = parseArgs({ args, options: commandLineOptions, allowPositionals: true })
if( options.domain ) process.env.FIBERY_DOMAIN = options.domain

// Setup
const FIBERY = process.env.FIBERY
function doSetup() {
    // Validate inputs
    assert.ok( FIBERY, 'FIBERY env var should be the path to the root of the Fibery tree' )
    assert.doesNotMatch( FIBERY, /[;:<>|$`]/, `dangerous shell characaters in FIBERY env var: ${FIBERY}` )

    // Call fiberyConfig.sh to get additional environment vars for the selected Fibery domain
    const cfg = path.join(FIBERY, 'fiberyConfig.sh')
    if (fs.statSync(cfg)) {
        const moreEnvVars = execFileSync(cfg, ['-0', process.env.FIBERY_DOMAIN ?? '']).toString()
        // Add the additional env vars to process.env
        for( const line of moreEnvVars.split('\0') ) {
            const [, name, value] = line.match( /(\w+)=([\S\s]*)/ ) ?? []
            if (name) process.env[name] = value
        }
    }
}

// Dump Fibery env vars:
// log( Object.fromEntries( Object.keys(process.env).filter( k => k.match(/fibery/i) ).map( k => [k, process.env[k]] ) ) )

function usage( cmd ) {
    const exe = path.basename( process.argv[1] )
    switch (cmd) {
        case 'push':
        case 'pull':
            error(`
${exe} - Manage Fibery Automations remotely
`)

        default:
            error(`
${exe} - Manage Fibery Automations remotely
Usage: ${exe} [ --domain=xyzzy.fibery.io ]  [ help | pull | push ]
        
Required environment variables:
    FIBERY             path to head of Fibery folders (contains dirs for the Fibery domains)
    FIBERY_API_KEY
`)
    }
    returnCode = 1
}

let returnCode = 0

async function main() {
    let cmd = positionals.shift()
    switch (cmd) {
        case 'pull':
        case 'push':
            pushPull(cmd)
            break
        
        case 'help':
            usage( positionals.shift() )
            break

        default:
            usage()
    }
}

function pushPull( cmd ) {
    doSetup()
    log(`pushPull(${cmd})`)
}

module.exports = {
    pushPull
}

main().then( () => process.exit(returnCode) )