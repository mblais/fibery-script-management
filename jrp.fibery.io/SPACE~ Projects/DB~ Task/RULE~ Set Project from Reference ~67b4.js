//.fibery SCRIPTID=62911776580c0ed393349801 ACTIONID=63430468-ae2c-4813-830e-f49f49e967b4

// If a Task's "Project" (parent) links is unset,
//  and a referencing entity exists that links to a Project, then
// link this Task to that referencing entity's Project.

const PARENT_TYPE       = 'Projects/Project'                 // Type we want to find a link to (value for)
const ENTITY_LINK_FIELD = 'Project'                          // Name of our field that needs to be set

// Suitable referencing Types, and which field to copy for our Project link
const refTypesFields = {
    'Projects/Project': null,                         // Use the referencing (parent) entity itself
    'Clients/Meeting Notes': 'Default Project',
    'Projects/Task': 'Project',
}

const fibery = context.getService('fibery')
const log    = console.log

for (const entity of args.currentEntities) {
    // Ignore if Project field is already set
    if (entity[ENTITY_LINK_FIELD].id)
        continue

    // Get all references to this entity
    const entityWithRefs = await fibery.getEntityById(entity.type, entity.id, ['References'])

    // Look through all the references
    for (const ref of entityWithRefs['References']) {
        // Get the referencing doc to find what type it's a part of
        const refDoc = await fibery.getEntityById('Collaboration~Documents/Reference', ref['Id'], ['FromEntityId', 'FromEntityType'])
        const refType = refDoc['FromEntityType'].name
        const fromEntityId = refDoc['FromEntityId']
        log(`refType = ${refType}`)

        // Can we use this ref entity (does it link to our parent type) ?
        if (!refTypesFields[refType]) {
            log(`! refTypesFields["${refType}"]`)
            continue
        }

        const linkFieldName = refTypesFields[refType]   // Name of link field we can use
        log('linkFieldName: ', linkFieldName)
        let parentId
        if (linkFieldName === null) {
            parentId = fromEntityId         // This is the actual Parent entity, so use its Id
        }
        else {
            const refEntity = await fibery.getEntityById(refType, fromEntityId, [linkFieldName])
            log('refEntity: ', refEntity)
            parentId = refEntity[linkFieldName].id    // The linked parent entity Id
        }

        log('parentId: ', parentId)
        await fibery.updateEntity(entity.type, entity.id, { [ENTITY_LINK_FIELD]: parentId })
        break
    }
}
