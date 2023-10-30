//.fibery SCRIPTID=64ac4ff5ff58afe1abad6537 ACTIONID=f12cf114-6bb6-4899-8f84-3fd46dadfb98

const fibery = context.getService('fibery')
const schema = await fibery.getSchema()
const type = args.currentEntities[0].type
// console.log( schema )
// console.log( schema.typeObjectsByName[type].fieldObjects )

function dumpFieldObject(type, field) {
    console.log(`\ntype: "${type}"  field: "${field}"\n`)
    schema.typeObjectsByName[type].fieldObjects.map(fo => console.log(fo.name))
    
    const relationFieldObject = schema.typeObjectsByName[type].fieldObjectsByName[field]
    console.log(`relationFieldObject:`, relationFieldObject)
    
    const relatedFieldObject = relationFieldObject.relatedFieldObject
    console.log(`relationFieldObject:`, relationFieldObject)

    const linkRule = relationFieldObject.linkRule || relatedFieldObject.linkRule
    console.log( `type: "${type}"  field: "${field}"\n`, JSON.stringify(linkRule, null, 2) )
}

dumpFieldObject('Projects/Page','Projects/Current State')
