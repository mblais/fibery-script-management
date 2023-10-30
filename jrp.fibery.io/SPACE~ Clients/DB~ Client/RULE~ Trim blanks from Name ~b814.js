//.fibery SCRIPTID=62b4c72d937041e7fb289575 ACTIONID=5e6856a9-d855-4804-9d1d-b81b47a1b814

// Trim blanks from entity Name
const fibery = context.getService('fibery')
for (const entity of args.currentEntities) {
    const newName = entity.name.trim()
    if (newName !== entity.Name)
        await fibery.updateEntity(entity.type, entity.id, { Name: newName })
}
