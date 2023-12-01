//.fibery AUTOID=62b334ce094a7220c7f897f1 ACTIONID=0d382df4-ffb9-40c2-a678-eff9b20a3602

// Set UUID field from entity Id
const fibery = context.getService('fibery')
for (const entity of args.currentEntities) {
    if (entity['UUID'] !== entity.Id)
        await fibery.updateEntity(entity.type, entity.Id, { 'UUID': entity.Id})
}