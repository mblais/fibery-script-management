//.fibery AUTOID=6298dbdc58a4fbf436ced504 ACTIONID=79454a3a-023c-4596-91df-f5c530672046

// Create a new Meeting Notes entity and and it link to Client entity

// const log = console.log
// const dump = (obj) => JSON.stringify(obj, null, 2)
// function assert(b, msg=undefined) { if (!b) throw new Error(msg) }
const fibery = context.getService('fibery')

const MN_SPACE = 'Clients'
const MN_TYPE = `${MN_SPACE}/Meeting Notes`
const MN_TEMPLATE_ENTITY_NAME = 'Meeting Notes TEMPLATE'

// Find the Meeting Notes Template entity ID
let template_mn_id
const query = `query ($name: String) {findMeetingNotes (name:{is:$name}) {id}}`
const vars = { name: MN_TEMPLATE_ENTITY_NAME }
try {
    template_mn_id = (await fibery.graphql(MN_SPACE, query, vars)).data.findMeetingNotes[0].id
} catch (err) {
    err.message = `I did not find a ${MN_TYPE} entity named "${MN_TEMPLATE_ENTITY_NAME}"` + err.message
    throw err
}

// Create a new Meeting Notes entity and auto-link it to the Client
for (const client of args.currentEntities) {
    await fibery.createEntity(MN_TYPE, { 'Client ID': client['Public ID'], Template: template_mn_id } )
}