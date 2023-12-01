//.fibery AUTOID=62b34e9a094a7220c7f90c6c ACTIONID=247a0035-856e-44da-9fa6-520c2b9df475

// Trim blanks from entity Name
const fibery = context.getService('fibery')
for (const entity of args.currentEntities) {
    const newName = entity.name.trim()
    if( newName !== entity.Name )
        await fibery.updateEntity(entity.type, entity.id, { Name: newName })
}
