//.fibery SCRIPTID=62b6a8cc067554e484a18117 ACTIONID=2dd6fb9b-3065-4a04-b684-1b64dff0965a

const MTIME_NAME = 'Meeting Time (ET)'  //1
const fibery = context.getService('fibery')
for (const entity of args.currentEntities) {
    const mtime  = entity[MTIME_NAME] || ''
    const mtime2 = mtime.trim().toLowerCase().replace(/\s\s+/g, ' ')
        .replace(/(\d)\s*([ap])\.?m\.?.*/i, '$1 $2m ET')
    if (mtime !== mtime2)
        await fibery.updateEntity(entity.type, entity.id, { [MTIME_NAME]: mtime2 })
}
