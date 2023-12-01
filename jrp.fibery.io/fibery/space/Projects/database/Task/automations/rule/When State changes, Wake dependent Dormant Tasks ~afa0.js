//.fibery AUTOID=62ad535563c2519a05455754 ACTIONID=088d64d7-749f-4f0c-8045-76aeb67fafa0

// Wake all Dormant Dependent Tasks

//const dump = obj => console.log(JSON.stringify(obj, null, 2))
const fibery = context.getService('fibery')
const dep_type = args.currentEntities[0].type    // Dependents are also Tasks

for (const entity of args.currentEntities) {
    const entity2 = await fibery.getEntityById(entity.type, entity.id, ['Dependencies'])
    for (const dep of entity2['Dependencies']) {
        const dep2 = await fibery.getEntityById(dep_type, dep.id, ['Name', 'State', 'Blocked'])
        const blocked = dep2['Blocked']
        //console.log(JSON.stringify(dep2, null, 2))
        if (dep2.State.Name === 'DORMANT') {
            //console.log( `"${dep2.Name}": Changing Task State: DORMANT -> Open` )
            await fibery.setState( dep_type, dep2.id, blocked ? 'Blocked':'Open' )
        }
    }
}