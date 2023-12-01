//.fibery AUTOID=63f6c1fa18397fcd7d1e7574 ACTIONID=64d8573e-c339-402f-bc2f-b0d8c9bcd08b

// BUTTON: Get password of Credentials entity
const source = 'C:\\Users\\Matt\\Documents\\WORK\\JRP\\_FIBERY\\jrp.fibery.io\\SPACE\\Credentials\\DB\\Credentials\\BUTTON Get Password.js'

const fibery = context.getService('fibery')
// console.log('\n----------------------------')
// const schema = await fibery.getSchema()
// const getFieldObject = (type, fieldName) => schema.typeObjectsByName[type].fieldObjects.find((f) => f.title === fieldName)
// const role_type = 'Users/Role'
// console.log(`"$(role_type}":`, schema.typeObjectsByName[role_type].fieldObjects.map(f=>f.name) )
// const list_schema_fields = (t) =>
//    console.log(`"${t}":`, schema.typeObjectsByName[t].fieldObjects.map(f => f.name))
// list_schema_fields('fibery/user')
// list_schema_fields('Users/Role')

const type = args.currentEntities[0].Type
const [, thisSpace, thisType] = type.match(/(.*?)\/(.*)/)
// console.log(`This DB: ${thisSpace}/${thisType}`)
const roles_field = `${thisType}/Access`
const userName = args.currentUser['Name'], userId = args.currentUser['id']   // Who's running the Button script

for (const entity of args.currentEntities) {
  // Get Roles linked to Credentials entity
  const roles = (await fibery.executeSingleCommand({
    'command': 'fibery.entity/query', 'args': {
      'query': {
        'q/from': type, 'q/select': [
          // 'fibery/id', 
          {
            [roles_field]: {
              'q/select': ['fibery/id', 'Users/Name',
                { 'user/user': ['fibery/id', 'user/name'] }
              ],
              'q/limit': 'q/no-limit'
            }
          }
        ],
        'q/where': ['=', ['fibery/id'], '$id'],
        'q/limit': 'q/no-limit',
      },
      'params': { '$id': entity.Id }
    }
  }))[0][roles_field]

  // console.log(roles)

  if (roles.find(r => r['user/user']['fibery/id'] === userId)) {
    console.log(`Credential "${entity.Name}":  \tURL: ${entity['Login URL']}  \tUser: "${entity['Username']}"  \tPassword: "${entity['Password']}"`)
  } else {
    const msg = `User "${userName}" does not have access to the Credential "${entity.Name}"`
    console.log(msg)
    throw Error(msg)
  }
}

return "Hit Ctrl•Shift•J to view results in browser console"