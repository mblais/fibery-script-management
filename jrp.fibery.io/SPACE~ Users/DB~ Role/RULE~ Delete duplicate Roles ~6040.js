//.fibery SCRIPTID=62b5df80937041e7fb2d8eca ACTIONID=bd8e786c-2b6f-47af-a89e-a4d879926040

// Search for identical Roles (by Name) and delete all but the oldest one
const fibery = context.getService('fibery')
const entity_type = args.currentEntities[0].type
const SPACE_NAME = 'Users'

for (const entity of args.currentEntities) {
    // Find all identical Roles
    const query = `{findRoles( name:{is: "${entity.name}"} orderBy:{creationDate: ASC}) {id}}`
    const result = await fibery.graphql(SPACE_NAME, query)
    // Delete any duplicates
    if (result && result.data.findRoles.length > 1) {
        const roles = result.data.findRoles
        for (let i = 1; i < roles.length; i++) {
            // console.log(`Deleting: ${roles[i].id}`)
            await fibery.deleteEntity(entity_type, roles[i].id)
        }
    }
}
