// DumpRelation - dump the details of a relation field (including auto-link rule)

const fibery = context.getService('fibery')
const schema = await fibery.getSchema()
const type   = args.currentEntities[0].type
// console.log( schema )
// console.log( schema.typeObjectsByName[type].fieldObjects )
// schema.typeObjectsByName[type].fieldObjects.map(fo => console.log(fo.name))   // All field names

const fieldObjectMembers = 'holderType title type name relation isReadOnly linkRule'.split(' ')

const schemaFieldObjects = Object.fromEntries(
    schema.typeObjects.flatMap( (typeObject) =>
        typeObject.fieldObjects.map( (fieldObject) => [fieldObject.id, fieldObject] )
))

function describeField( fieldId ) {
    const fieldObject = schemaFieldObjects[ fieldId ]
    return `[${fieldObject.holderType}] "${fieldObject.name}"`
}

function dumpOperand( name, operand ) {
    console.log( `${name} => `, describeField(operand[0]) )
}

function dumpField( fieldObject ) {
    console.log(`\nFieldObject: `, Object.fromEntries(
        fieldObjectMembers.map( k => [k, fieldObject[k]] )) )
    if (fieldObject['linkRule']) {
        dumpOperand('operands[0].expression        ', fieldObject.linkRule.operands[0].expression)
        dumpOperand('operands[0].relationExpression', fieldObject.linkRule.operands[0].relationExpression)
    }
}

function dumpRelation( type, field)  {
    console.log(`\n---------------------------------------------------------------\nDumpRelation:  [${type}] "${field}"\n`)

    const relationFieldObject = schema.typeObjectsByName[type].fieldObjectsByName[field]
    dumpField(relationFieldObject)

    const relatedFieldObject = relationFieldObject.relatedFieldObject
    dumpField(relatedFieldObject)

    // const linkRule = relationFieldObject.linkRule || relatedFieldObject.linkRule
    // console.log(`\ntype: "${type}"  field: "${field}"\n`, JSON.stringify(linkRule, null, 2))
}

dumpRelation('Projects/Page',          'Projects/Page Workflow')
dumpRelation('Projects/Page Workflow', 'Projects/Page')
