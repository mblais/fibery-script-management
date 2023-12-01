//.fibery AUTOID=62b4c6f0937041e7fb2894b8 ACTIONID=f16f46bf-b5af-44b6-926a-fcc84beed26b

// Trim blanks from entity Name
const fibery = context.getService('fibery')
for (const entity of args.currentEntities) {
    const newName = entity.name.trim()
    if (newName !== entity.name)
        await fibery.updateEntity(entity.type, entity.id, { Name: newName })
}