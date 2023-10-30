//.fibery SCRIPTID=64d398129d0d4ff46f49c5c3 ACTIONID=350fe502-cdfb-493e-a0c6-30cb7cd5b197

const fibery = context.getService('fibery');
const schema = await fibery.getSchema();

const linkField = schema.typeObjects.flatMap(t => t.fieldObjects).find(f => f.id === "a03882a6-21d6-4ba9-99b4-be5bcbcddcee");
console.log(linkField ? linkField.name : "not found");
