//.fibery SCRIPTID=62b4c6c8067554e4849a81b9 ACTIONID=cdf078c8-a395-4309-ac95-04051dc58d11

// Trim blanks from entity Name
const fibery = context.getService('fibery')
for (const entity of args.currentEntities) {
    const newName = entity.name.trim()
    if (newName !== entity.Name)
        await fibery.updateEntity(entity.type, entity.id, { Name: newName })
}
