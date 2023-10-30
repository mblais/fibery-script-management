//.fibery SCRIPTID=64a5f4ddff58afe1ab947567 ACTIONID=b408d7c2-84bd-4a42-b9f8-38b965e8fa2b

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
        const field  = entity[fieldName]
        if( !field ) continue
        const secret = field['Secret']
        if (secret) {
            const content = await fibery.getDocumentContent(secret, 'md')
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

/*
for (const entity of args.currentEntities) {
    const value = entity['Main Content']
    const json = await fibery.getDocumentContent( value.Secret, 'json' )
    console.log('\n-------------------------------', json )
    const html = await fibery.getDocumentContent(value.Secret, 'html')
    console.log('\n-------------------------------', html)
    const md = await fibery.getDocumentContent(value.Secret, 'md')
    console.log('\n-------------------------------', md)
}
*/