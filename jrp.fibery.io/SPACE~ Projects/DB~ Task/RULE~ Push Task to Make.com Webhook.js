//.fibery SCRIPTID=629f801b58a4fbf436ea0304 ACTIONID=bfb3e8ea-7a2d-4d07-959b-451922954545

const fibery = context.getService('fibery')
const http = context.getService('http')
//const ASANA_MAKE_HOOK_URL = 'https://hook.us1.make.com/4lndkiue17jnel09vuh9a4fnf6hjhasu' //3
const ASANA_MAKE_HOOK_URL = 'https://hook.us1.make.com/57huj5ov8u0zn7q3suxp9cepsegn9auj' //4

let message = ''

for (const entity of args.currentEntities) {
    console.log('\n', entity)
    if (!assert0(entity['Asana Project ID'], `Task "${entity.Name}" not pushed: Client's Asana Project ID is not set`))
        continue
    const state = entity.State.Name
    if (!assert0(!state.match(/DORMANT|HOLD/i), `Task "${entity.Name}" not pushed: State is "${state}"`))
        continue
    const assignees = entity.Assignees
    if (!assert0(assignees.length > 0, `"Task ${entity.Name}" not pushed: There are no Assignees`))
        continue
    // Get Description field content as Markdown
    const md = await fibery.getDocumentContent(entity.Description.Secret, 'md')
    const Description2 = { ...entity.Description, md: md }
    const entity2 = { ...entity, Description: Description2 }
    const result = await http.postAsync(ASANA_MAKE_HOOK_URL, {
        body: { entity: entity2 },
        headers: { 'Content-type': 'application/json' }
    })
    console.log('RESULT: ', result)
}

// Reset "Push" checkbox field
for (const entity of args.currentEntities) {
    await fibery.updateEntity(entity.type, entity.id, { 'Push': false })
}

if (message) {
    //throw new Error(message)
    console.log(message)
}

function assert0(b, msg) {
    if (!b) message += msg + '\n'
    return b
}