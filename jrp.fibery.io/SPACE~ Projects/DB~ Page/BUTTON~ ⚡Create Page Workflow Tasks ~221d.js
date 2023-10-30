//.fibery SCRIPTID=62a66313d253756cea154805 ACTIONID=f6eeb803-6ff5-4455-945b-71dbbd48221d

// Abort Button actions if any Page Workflow Tasks already exist

const fibery = context.getService('fibery')
for (const entity of args.currentEntities) {
    const entity2 = await fibery.getEntityById(entity.type, entity.id, ['Tasks'])
    if (entity2.Tasks.find(e => e.Name.match(/^(WRITE|REVIEW|BUILD|PROOF) /)))
        throw new Error(`ABORTED: The page "${entity.Name}" has existing Page Workflow Tasks`)
}