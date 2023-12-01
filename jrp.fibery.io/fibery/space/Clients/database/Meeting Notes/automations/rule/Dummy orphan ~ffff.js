//.fibery AUTOID=63d6c9b13cde3e0666a06db9 ACTIONID=6ec24c15-dc0c-41ce-9b46-25dbabcdffff

/*
const MN_SPACE = 'Clients'
// const TAG_TYPE = 'Types/Tags', TAGS_FIELD = 'Tags'

const fibery = context.getService('fibery');

// affected entities are stored in args.currentEntities;
// to support batch actions they always come in an array
for (const entity of args.currentEntities) {
    // Remove the TEMPLATE tag
    // const entity2 = await fibery.getEntityById(entity.type, entity.Id, [TAGS_FIELD])
    // const entityTags = entity2['Tags']
    // if (entityTags) {
    //     const templateTag = entityTags.find(e => e.Name.match(/TEMPLATE\s*$/))
    //     if (templateTag) {
    //         await fibery.removeCollectionItem(entity.type, entity.Id, TAGS_FIELD, templateTag.Id)
    //     }
    // }

    // Unlink TEMPLATE Tag from entity (graphql)
    const query = `mutation($id: ID, $tagName: String){ meetingNotes(id:{is:$id}) { unlinkTags(name:{contains:$tagName}) { message }}}`
    const vars  = { "id": entity.id, "tagName": "TEMPLATE" }
    const message = await fibery.graphql(MN_SPACE, query, vars)
}
*/