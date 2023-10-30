//.fibery SCRIPTID=62ba1481937041e7fb3bef04 ACTIONID=00582656-7bf7-40e1-bd06-cf5b706f1c88

// Update associated Page Workflow State on Task State change

const PAGE_WORKFLOW_TYPE = 'Projects/Page Workflow'
// const PAGE_WORKFLOW_STATE_TYPE = 'workflow/state_Projects/Page Workflow'

const fibery = context.getService('fibery')

for (const entity of args.currentEntities) {
    console.log('entity.State: ', entity.State)
    if (entity.State.Name !== 'Open' &&    // Only run when state is started/progressing
        entity.State.Name !== 'Progress') {
        continue
    }
    const pageWorkflow = entity['Page Workflow']
    if (!pageWorkflow) continue
    const taskTypeName = entity['Task Type'].Name
    // Map Task-Type to name of Page-Workflow-State corresponding to this Task
    const newWorkflowStateName = {
        'write': 'Write',
        'review': 'Client Review',
        'build': 'Build',
        'proof': 'Proof'
    }[taskTypeName.replace(
        /[^0-z ]/g, '').toLowerCase()  // Remove emoji and spaces from Task Type name
    ]
    console.log('newWorkflowState name: ', newWorkflowStateName)
    if (newWorkflowStateName) {
        console.log('pageWorkflow: ', pageWorkflow)
        await fibery.setState(PAGE_WORKFLOW_TYPE, pageWorkflow.Id, newWorkflowStateName)
    }
}
