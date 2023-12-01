//.fibery AUTOID=655420b703d5fe41860d4665 ACTIONID=bfbbe134-7fa8-40fe-97ee-28c956a4f37b

const fibery = context.getService('fibery')
/***
function setState(entity, newState) {
}

class Action {
    constructor(entity) {
        Object.assign(this, entity)
    }
    get task() { return this }  // :-(

}

for (const entity of args.currentEntities) {
    console.log('Go! ' + entity.Name)
    const action = new Action(entity)
    switch (action.Name) {
        case 'Approved':
            action.task.setState('Done')
            break
        
        case 'Rewrite':
            break

        default:
            throw(`Unrecognized Action "${action.Name}"`)
    }
}
***/