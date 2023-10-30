//.fibery SCRIPTID=635189de92f9fa5866587a02 ACTIONID=1c2c2a36-7a34-45b5-852a-b0ccfa465c31

// When someone changes the State of a Page Workflow entity,
// change the new coresponding Task => Open, if it's currently blocked|dormant|done|hold

const PAGE_WORKFLOW_TYPE = 'Projects/Page Workflow', TASK_TYPE = 'Projects/Task'
const TASK_STATE_OPEN = 'Open'
const log = console.log
const fibery = context.getService('fibery');

for (const entity of args.currentEntities) {
    const currentTask = entity['Current Task']
    if (!currentTask)
        continue
    // Get the current Task
    const task = await fibery.getEntityById(TASK_TYPE, currentTask.Id, ['Name', 'State'])
    if (!task || !task.State.Name.match(/blocked|dormant|done|hold|waiting/i))
        continue
    // Change Current Task state => Open
    // log(`Updating Task state => ${TASK_STATE_OPEN}: "${task.Name}"`)
    await fibery.setState(TASK_TYPE, task.Id, TASK_STATE_OPEN)
}