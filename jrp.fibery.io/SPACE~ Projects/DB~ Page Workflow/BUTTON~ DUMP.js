//.fibery SCRIPTID=62bdcb7c937041e7fb4f9c47 ACTIONID=10c49076-0514-40c0-9333-e44deb3a5003

// DUMP entities to console log
const fibery = context.getService('fibery')
for (const entity of args.currentEntities) {
    console.log('\n', JSON.stringify(entity, null, 2))
}