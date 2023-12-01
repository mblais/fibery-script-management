//.fibery AUTOID=62bdce9c937041e7fb4fb47f ACTIONID=c9a0a464-3fe3-4a3b-a492-b30cc97361b6

//  Get Workspace Schema
const fibery = context.getService('fibery')
const schema = await fibery.getSchema()
console.log(schema)