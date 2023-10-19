// Test processing of command-line args, env vars, exec child process

const fs                            = require('node:fs')
const { join }                      = require('node:path')
const assert                        = require('node:assert').strict
const { parseArgs }                 = require('node:util')              // https://nodejs.org/api/util.html#utilparseargsconfig
const { execFileSync }              = require('node:child_process')

const {log,warn,error}              = console
const stringify = (arg) => JSON.stringify(arg,null,2)

const commandLineOptions = {
    domain: { type: 'string',       short: 'd' },     // FIBERY_DOMAIN
    space:  { type: 'string',       short: 's' },
    type:   { type: 'string',       short: 't' },
    button: { type: 'string',       short: 'b' },
    rule:   { type: 'string',       short: 'r' },
    all:    { type: 'boolean',      short: 'a' },
}

const args = [ '--domain', 'jrp.fibery.io', '-b.', '-r*', 'pos2' ]   // Test args for parseArgs
// const args = process.argv.slice(2)

const {values: options, positionals} = parseArgs({ args, options: commandLineOptions, allowPositionals: true })
log(`values:`, stringify(options))
log(`postionals:`, stringify(positionals))

// if( options.domain ) process.env.FIBERY_DOMAIN = options.domain
// // Validate inputs
// const FIBERY = process.env.FIBERY
// assert.ok( FIBERY, 'FIBERY env var should be the path to the root of the Fibery tree' )
// assert.doesNotMatch( FIBERY, /[;:<>|$`]/, `dangerous shell characaters in FIBERY env var: ${FIBERY}` )

// // Call fiberyConfig.sh to get additional environment vars for the selected Fibery domain
// const cfg = join(FIBERY, 'fiberyConfig.sh')
// if (fs.statSync(cfg)) {
//     const moreEnvVars = execFileSync(cfg, ['-0', process.env.FIBERY_DOMAIN ?? '']).toString()
//     // Add the additional env vars to process.env
//     for( const line of moreEnvVars.split('\0') ) {
//         const [, name, value] = line.match( /(\w+)=([\S\s]*)/ ) ?? []
//         if (name) process.env[name] = value
//     }
// }

// Dump Fibery env vars:
// log( Object.fromEntries( Object.keys(process.env).filter( k => k.match(/fibery/i) ).map( k => [k, process.env[k]] ) ) )
 