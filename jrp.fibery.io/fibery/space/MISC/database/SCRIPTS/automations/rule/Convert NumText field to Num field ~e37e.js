//.fibery AUTOID=65577f7b7f5fce9023894c45 ACTIONID=7fdce40e-a241-456a-9f36-7e96936be37e

const INPUT_TEXT_FIELD = 'NumText'
const OUTPUT_NUMERIC_FIELD = 'Num'
const fibery = context.getService('fibery');
for (const entity of args.currentEntities) {
    const num = parseFloat( entity[INPUT_TEXT_FIELD])
    await fibery.updateEntity(entity.type, entity.id, {
        [OUTPUT_NUMERIC_FIELD]: num
    })
}