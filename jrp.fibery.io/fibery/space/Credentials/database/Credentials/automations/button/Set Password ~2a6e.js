//.fibery AUTOID=6494a0591e63e2e7b1784fbe ACTIONID=d8d852dd-8d4e-4c79-9a1c-e3b2a2962a6e

// BUTTON: Set new password on Credentials entity
const source = 'C:\\Users\\Matt\\Documents\\WORK\\JRP\\_FIBERY\\jrp.fibery.io\\SPACE\\Credentials\\DB\\Credentials\\BUTTON Set Password.js'

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
        await fibery.updateEntity(type, entity.Id, { Password: entity.SetPassword, SetPassword: null })
        console.log(`Credential "${entity.Name}":  \tURL: ${entity['Login URL']}  \tUser: "${entity['Username']}"  \tPassword: "${entity['SetPassword']}"`)
    } else {
        await fibery.updateEntity(type, entity.Id, { SetPassword: null })
        const msg = `User "${userName}" does not have access to the Credential "${entity.Name}"`
        console.log(msg)
        throw Error(msg)
    }
}
