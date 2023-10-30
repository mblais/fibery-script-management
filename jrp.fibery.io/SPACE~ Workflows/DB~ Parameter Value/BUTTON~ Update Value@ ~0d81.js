//.fibery SCRIPTID=63f9024e4bf5e7ca0cf40603 ACTIONID=9dfd2b72-65bd-4e79-904c-785010fe0d81

const TZ = 'America/New_York'
const fibery = context.getService('fibery')

for (const entity of args.currentEntities) {
    const entity1 = await fibery.getEntityById(entity.type, entity.id, ['Type'])
    console.log(entity)
    let value
    switch (entity1.Type.Name) {
        case 'Date':
            const s = new Date(entity.Date).toLocaleTimeString('en-US', { timeZone: TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', hour12: true, minute: '2-digit' })
            // Is there a time?
            value = entity.Date.match(/T05:00:00.000Z$/) ?
                s.replace(/ at .*/, "") : s + " ET"
            break
        case 'Rich Text':
            const doc = await fibery.getDocumentContent(entity['Rich Text'].Secret, 'md')
            value = doc.substring(0, 79)
            break
        case 'User':
            value = entity.User.Name
            break
        case 'Text':
        case 'Number':
        default:
            value = entity.Text
    }
    console.log(value)

    await fibery.updateEntity(entity.type, entity.id, { 'Value@': value })
}