//.fibery SCRIPTID=62b9fe36937041e7fb3ba2fa ACTIONID=528b2eae-a6d7-4dd0-b54f-41b8559108f0

// Update associated Page Workflow State on Task State change

const PAGE_WORKFLOW_TYPE = 'Projects/Page Workflow'
const fibery = context.getService('fibery')

for (const entity of args.currentEntities) {
    // console.log('entity.State: ', entity.State)
    const currentStateName = entity.State.Name
    const pageWorkflow = entity['Page Workflow']
    const taskTypeName = entity['Task Type'].Name
    let newWorkflowStateName = null

    if (currentStateName === 'Done') {
        if (taskTypeName.match(/proof/i)) {
            // When Proof task is done, the Page state is completely Done
            newWorkflowStateName = 'Done'
        }
    }
    else {
        // Task not blocked, so it must be the "current" state of the page. 
        // Map the TaskType name to the corresponding PageWorkflow state name.
        newWorkflowStateName = {
            'write': 'Write',
            'review': 'Review',
            'build': 'Build',
            'proof': 'Proof'
        }[taskTypeName.replace(
            /[^0-z ]/g, '').toLowerCase()  // Remove emoji and spaces from Task Type name
        ]
        // console.log('newWorkflowState name: ', newWorkflowStateName)
    }
    if (newWorkflowStateName) {
        await fibery.setState(PAGE_WORKFLOW_TYPE, pageWorkflow.id, newWorkflowStateName)
    }
}
