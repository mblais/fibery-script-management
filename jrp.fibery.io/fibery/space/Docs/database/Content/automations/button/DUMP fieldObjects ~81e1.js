//.fibery AUTOID=64c41660c42db1e55c30db09 ACTIONID=a064aa73-8ed2-4c14-9956-91e102ce81e1

const fibery = context.getService('fibery')
const schema = await fibery.getSchema()
const type   = args.currentEntities[0].type
// console.log( schema )
// console.log( schema.typeObjectsByName[type].fieldObjects )
// schema.typeObjectsByName[type].fieldObjects.map(fo => console.log(fo.name))   // All field names

const fieldObjectMembers = 'title holderType type name relation linkRule'.split(' ')

const schemaFieldObjects = Object.fromEntries(
    schema.typeObjects.flatMap((typeObject) =>
        typeObject.fieldObjects.map((fieldObject) => [fieldObject.id, fieldObject] )
))

function describeField(fieldId) {
    const fieldObject = schemaFieldObjects[fieldId]
    return `[${fieldObject.holderType}] "${fieldObject.name}"`
}

function dumpOperand(name, operand) {
    console.log( `${name} => `, operand.map( id => describeField(id)) )
}

function dumpField( fieldObject ) {
    console.log(`\nFieldObject: `, fieldObjectMembers.map( m => new Object({ [m]: fieldObject[m] })))
    if (fieldObject['linkRule']) {
        dumpOperand( 'operand.expression',           fieldObject.linkRule.operands[0].expression )
        dumpOperand( 'operand.relationExpression',   fieldObject.linkRule.operands[0].relationExpression )
    }
}

function dumpRelation(type, field) {
    console.log(`\nDumpRelation - [${type}] "${field}"\n`)

    const relationFieldObject = schema.typeObjectsByName[type].fieldObjectsByName[field]
    dumpField(relationFieldObject)

    const relatedFieldObject = relationFieldObject.relatedFieldObject
    dumpField(relatedFieldObject)

    // const linkRule = relationFieldObject.linkRule || relatedFieldObject.linkRule
    // console.log(`\ntype: "${type}"  field: "${field}"\n`, JSON.stringify(linkRule, null, 2))
}

dumpRelation('Projects/Page', 'Projects/Page Workflow')

