//.fibery AUTOID=6324f66be8ad48cc4d7f1256 ACTIONID=7af3dda1-0176-4bdd-8dec-9b58a89e5d6d

// Populate the current "target" entity's collections with clones of the "child entities"
// in the corresponding collections of the linked Template entity.
const fibery = context.getService('fibery')

// Clone entities from these collections of the Template:
const cloneCollections = [
    // { collectionName: 'Tasks', collectionType: 'Projects/Task' },
    // { collectionName: 'Content', collectionType: 'Docs/Content' },
    // { collectionName: 'Pages', collectionType: 'Projects/Page' },
]
// NOTE: For collections where you want to link (not clone) the template collection's entities (many-to-*),
// just use the no-code part of the Rule to assign the collection from the Template to the Step-1-Entity -
// just like other (non-collection) fields are copied from the Template.

// Append the contents of the following Rich Text fields from the Template into the current "target" entity:
// (or you could overwrite, instead of appending)
const appendRichTexts = ['Notes & Resources','Main Content','Social Content','Email Content']

// I use the Tags field to mark an entity as a Template
const TAG_TYPE = 'Types/Tags', TAGS_FIELD = 'Tags'

// newParent is the "target" entity; newParent.Template is the Template entity (of the same type)
// whose contents we want to clone/duplicate into newParent's corresponding fields.
for (const newParent of args.currentEntities) {
    // console.log(`\nnewParent "${newParent.Name}": `, newParent)
    // Get all fields to clone from the Template entity
    // const ASSIGNEES_FIELD = "Assignees"
    const template = await fibery.getEntityById(newParent.type, newParent.Template.Id, [...appendRichTexts, ...cloneCollections.map(e => e.collectionName)]) // ASSIGNEES_FIELD,
    // console.log('\ntemplate: ', template)
    if (!template) {
        console.log(`newParent "${newParent.Name}" has empty Template - skipping`)
        continue
    }
    // For each Template collection to clone:
    for (const { collectionName, collectionType } of cloneCollections) {
        const currentCollection = template[collectionName]
        // console.log(`\ncurrentCollection "${collectionName}" [${currentCollection.length}]: `, currentCollection)

        // For each templateChild entity in this template collection, "clone" it -
        // which at this stage consists only of creating a new entity,
        // linking it to newParent, and also linking its "Template" field to the templateChild clone-source
        // This Template linking will trigger a Rule in the child DB which is responsible for actually copying
        // the new child entity's fields from the linked Template.
        for (const templateChild of currentCollection) {
            // console.log('\ntemplateChild: ', templateChild)
            const newChild = await fibery.createEntity(collectionType, {  // the child clone-to-be
                // Remove "TEMPLATE" from end of Name field
                Name: templateChild.Name.replace(/\W+TEMPLATE\W*$/, ''),
                Template: templateChild.Id      // This causes field-copying to happen via a Rule in the child DB
            })
            // Add the new child (clone) entity to newParent's collection
            await fibery.addCollectionItem(newParent.type, newParent.Id, collectionName, newChild.Id)
        }
    }

    // Append the requested Rich Text fields from Template entity to newParent
    for (const field of appendRichTexts) {
        const templateSecret = template[field].Secret
        const parentSecret = newParent[field].Secret
        const content = await fibery.getDocumentContent(templateSecret, 'html')
        await fibery.appendDocumentContent(parentSecret, content, 'html')       // Must use html to preserve formatting!
    }

    // Remove the TEMPLATE tag from newParent
    const newParent2 = await fibery.getEntityById(newParent.type, newParent.Id, [TAGS_FIELD])
    const newParentTags = newParent2['Tags']
    if (newParentTags) {
        const templateTag = newParentTags.find(e => e.Name.match(/TEMPLATE\s*$/))
        if (templateTag) {
            await fibery.removeCollectionItem(newParent.type, newParent.Id, TAGS_FIELD, templateTag.Id)
        }
    }
}
