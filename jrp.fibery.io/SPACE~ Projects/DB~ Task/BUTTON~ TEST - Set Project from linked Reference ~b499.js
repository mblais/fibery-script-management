//.fibery SCRIPTID=62b3a4ca094a7220c7fa3356 ACTIONID=d66fe3d7-1014-47f5-8087-fede3093b499

// If a Task's "Project" (parent) field is uninitialized, and a referencing entity exists that
// that is related to the same Project/parent type, then
// set this Task's "Project" field to match the parent link from the referencing entity.

const PARENT_TYPE       = 'Projects/Project'                 // Type we want to find a link to (value for)
const ENTITY_LINK_FIELD = 'Project'                          // Name of our field that needs to be set
//const REF_ENTITY_TYPES  = ['Clients/Meeting Notes', 'Projects/Task']   // Referencing Types that can have our link
//const LINK_FIELDS       = ['Default Project', 'Project']    // Possible field names of parent Project link

// Suitable referencing Types and their field to use
const refTypesFields = {
    'Projects/Project'      : null,
    'Clients/Meeting Notes' : 'Default Project',
    'Projects/Task'         : 'Project',
}

const fibery = context.getService('fibery')
const log    = console.log

for (const entity of args.currentEntities) {
    // Set the Project field only if empty
    if ( entity[ENTITY_LINK_FIELD].id )
        continue

    // Get all references to this entity
    const entityWithRefs = await fibery.getEntityById(entity.type, entity.id, ['References'])

    // Look for a reference with a link to the parent type we're looking for
    for (const ref of entityWithRefs['References']) {
        // Get the referencing doc
        const refDoc        = await fibery.getEntityById('Collaboration~Documents/Reference', ref['Id'], ['FromEntityId', 'FromEntityType'])
        const refType       = refDoc['FromEntityType'].name
        const fromEntityId  = refDoc['FromEntityId']
        let   parentId
        log(`refType = ${refType}`)

        // Can we use this ref entity (does it link to our parent type) ?
        if ( !refTypesFields[refType] ) {
            log(`! refTypesFields["${refType}"]`)
            continue
        }

        const linkFieldName = refTypesFields[refType]
        log( 'linkFieldName: ', linkFieldName )
        if ( linkFieldName===null) {
            parentId = fromEntityId         // This is the actual Parent entity, so use its Id
        }
        else {
            const refEntity = await fibery.getEntityById( refType, fromEntityId, [linkFieldName] )
            log( 'refEntity: ', refEntity )
            parentId = refEntity[ linkFieldName ].id
        }

        log( 'parentId: ', parentId )
        await fibery.updateEntity(entity.type, entity.id, { [ENTITY_LINK_FIELD]: parentId } )
        break
    }
}
