//.fibery AUTOID=65204a518e3f7f51c609768f ACTIONID=8bdcca39-d235-4a88-901c-dd982f7099c4

// Tick the corresponding checkbox in the related Page Workflow entity
const fibery = context.getService('fibery');
const PW_type = 'Projects/Page Workflow'
for (const entity of args.currentEntities) {
    //const entity2 = await fibery.getEntityById(entity.type, entity.id, ['Page Workflow'])
    const pw = entity['Page Workflow']
    await fibery.updateEntity(PW_type, pw.id, {'Writing Approved?': true})
}
