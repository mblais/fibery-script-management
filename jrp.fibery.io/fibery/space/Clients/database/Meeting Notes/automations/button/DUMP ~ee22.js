//.fibery AUTOID=64ac7267f0aac68fd7773b47 ACTIONID=6f3349aa-c5e0-4960-ae65-47b383f4ee22

const fibery = context.getService('fibery')
const schema = await fibery.getSchema()
const type = args.currentEntities[0].type
// console.log(schema)
for (const fo of schema.typeObjectsByName[type].fieldObjects.filter(f => f.title.match(/document/i))) {
    console.log( `"${fo.title}" `, fo )
}
