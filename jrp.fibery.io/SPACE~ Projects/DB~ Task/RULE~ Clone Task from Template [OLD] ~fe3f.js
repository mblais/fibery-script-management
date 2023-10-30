//.fibery SCRIPTID=62dc5369ae91d3ad52d616a4 ACTIONID=8b5bc47f-3654-4a9c-a7b6-40d9debafe3f

// Clone the current "parent" entity's linked Template to the current entity:
const TAG_TYPE = 'Types/Tags', TAGS_FIELD = 'Tags'

// Append contents of Rich Text fields from Template to the current entity:
const appendRichTexts = ['Description']

const fibery = context.getService('fibery')

// newParent is the target entity; newParent.Template is its Template entity (of same type),
// that we want to clone/duplicate into newParent.
for (const newParent of args.currentEntities) {
    // console.log(`\nnewParent "${newParent.Name}": `, newParent)
    // Get all the collections to clone from the Template entity
    const template = await fibery.getEntityById(newParent.type, newParent.Template.Id, [...appendRichTexts])
    // console.log('\ntemplate: ', template)
    if (!template) {
        console.log(`newParent "${newParent.Name}" has empty Template - skipping`)
        continue
    }

    // Append Rich Text fields from Template to newParent
    for (const field of appendRichTexts) {
        const templateSecret = template[field].Secret
        const parentSecret = newParent[field].Secret
        const content = await fibery.getDocumentContent(templateSecret, 'html')
        await fibery.appendDocumentContent(parentSecret, content, 'html')
    }

    // Remove the TEMPLATE tag from newParent
    // const newParent2 = await fibery.getEntityById(newParent.type, newParent.Id, [TAGS_FIELD])
    // const newParentTags = newParent2['Tags']
    // if (newParentTags) {
    //     const templateTag = newParentTags.find(e => e.Name.match(/TEMPLATE\s*$/))
    //     if (templateTag) {
    //         await fibery.removeCollectionItem(newParent.type, newParent.Id, TAGS_FIELD, templateTag.Id)
    //     }
    // }
}
