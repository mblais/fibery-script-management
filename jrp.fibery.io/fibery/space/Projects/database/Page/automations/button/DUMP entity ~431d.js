//.fibery AUTOID=64bb028d40bcfc43719484b6 ACTIONID=050de745-e060-4264-b3d7-9419f038431d

const fibery = context.getService('fibery');
const schema = await fibery.getSchema()
const type = args.currentEntities[0].type
const log = console.log
// log(schema)
// log( schema.typeObjectsByName[type].fieldObjects.filter( f => f.title.match(/file/i)) )

const yourAccountHostName = 'https://jrp.fibery.io'

for (const entity of args.currentEntities) {
    log('\n', entity)
    for (const fieldName in entity) {
        const field = entity[fieldName]
        const secret = field['Secret']
        if (secret) {
            const content = await fibery.getDocumentContent(secret, 'json')
            log(`\n${fieldName}:\n`, JSON.stringify(content))
        }
    }
    // const entity2 = await fibery.getEntityById(type, entity.Id, ['Files'])
    // log('Files:', entity2.Files)
    // for (const file of entity2.Files) {
    //     const fileWithSecret = await fibery.getEntityById('fibery/file', file.Id, ["Secret", "Name", "Content Type"])
    //     const fileUrl = yourAccountHostName + "/api/files" + fileWithSecret["Secret"];
    //     log( 'fileUrl:', fileUrl )
    // }
}