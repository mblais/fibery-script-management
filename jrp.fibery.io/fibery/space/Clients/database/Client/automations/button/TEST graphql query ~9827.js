//.fibery AUTOID=62b1dca395275ca1bc7dd0aa ACTIONID=c9e47759-6992-4c34-be7b-604d22189827

const log = console.log
const dump = (obj) => JSON.stringify(obj, null, 2)
function assert(b, msg = undefined) { if (!b) throw new Error(msg) }
const fibery = context.getService('fibery')

const MN_SPACE = 'Clients'
const MN_TYPE = `${MN_SPACE}/Meeting Notes`
const MN_TEMPLATE_ENTITY_NAME = 'Meeting Notes TEMPLATE'

for (const client of args.currentEntities) {
    // Create a new Meeting Notes entity and auto-link it to the Client
    // const new_meetNotes = await fibery.createEntity(MN_TYPE, { 'Client ID': client['Public ID'] })
    // const new_mn_id = new_meetNotes.id

    // Find the Meeting Notes Template entity
    const query = `query ($name: String) {findMeetingNotes (name:{is:$name}) {id}}`
    const vars = { name: MN_TEMPLATE_ENTITY_NAME }
    let template_mn_id
    try {
        const res = await fibery.graphql(MN_SPACE, query, vars)
        log(res)
        template_mn_id = res.data.findMeetingNotes[0].id
    } catch (err) {
        err.message = `I did not find a ${MN_TYPE} entity named "${MN_TEMPLATE_ENTITY_NAME}"` + err.message
        log(err)
    }
   log( `template_mn_id: ${template_mn_id}` )
}