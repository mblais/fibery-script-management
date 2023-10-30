//.fibery SCRIPTID=62911775580c0ed3933497f5 ACTIONID=c702cad0-c825-4eec-9edb-4ee0a8bd487d

// Create associated Page Workflow and Content entities and link to Page

const PAGE_WORKFLOW_TYPE = 'Projects/Page Workflow'
const CONTENT_TYPE       = 'Docs/Content'

const fibery = context.getService('fibery')

for (const entity of args.currentEntities) {
    // The Cloner ignores OneToX auto-linked relations, so we still need to create Page Workflow
    await fibery.createEntity(PAGE_WORKFLOW_TYPE, { 'Page ID': entity['Public ID'] })   // Auto-linked, so NOT cloned
    const rules    = entity['Rules']
    const isaClone = rules && rules.indexOf('[CLONE]') >= 0
    // If this Page is cloned, the Cloner should make a Content entity for it (cloned from the template Page's Content entity)
    if (!isaClone)
        await fibery.createEntity( CONTENT_TYPE,  {'Page': entity.id })     // NOT auto-linked, so cloned
}