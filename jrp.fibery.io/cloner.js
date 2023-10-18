/* git log
*/

const scriptSource          = '_FIBERY/jrp.fibery.io/cloner.js'
const API_TOKEN             = '5ca15987.3c0091232ae3a06a509ca0601213f26a844' // Required to copy Files attachments - See Workspace menu | Settings | Personal | API Keys
const fiberyAccountHostName = 'https://jrp.fibery.io'       // Required to copy Files attachments

// Clone subject entities from their related Template entity, including related entities.
// This overwrites the subject entities with their Template entities.
// "subject" refers to a target entity that is being cloned/overwritten from its corresponding template entity.
// "Cloning" an entity means creating a new entity (if necessary) and setting its fields from the original (template) entity,
// then recursively copying/cloning all entities in its relations & collections as well. Cloning is a recursive process.
// Note that the subject (target) entity for a cloning operation may already exist, or it may be created by the script if needed.
//
// COLLECTIONS AND LINKED ENTITIES:
// "Child" (member) entities of a template's collections are either copied (linked) or cloned to a subject's corresponding collections.
// A child entity is cloned if it is also a template entity (i.e. it has an "Is Template" field that is true);
// else it is copied (i.e. its Id is just added to the subject's corresponding collection).
// "OneToX" relations must be cloned, because linking them to the subject would un-link them from the template entity.

const templateField         = 'Template'                    // Field name of the Template relation that links to the template entity to be cloned
const templateTargetsField  = 'Template Targets'            // Field name of the other side of a Template relation (collection)
const isTemplateField       = 'Is Template'                 // Name of the field that determines if an entity is a Template
const rulesField            = 'Rules'                       // Name of field containing Rules
const titleField            = 'Title'                       // Name of field containing entity Title
const fibery                = context.getService('fibery')
const schema                = await fibery.getSchema()

const log                   = console.log, warn = console.log
const assert                = (condition, msg) => { if ( !condition ) throw Error(msg) }
const entityKey             = (type, id) => id + ' ' + type
const makeContext           = (type, entity, fieldName, fieldType, linkedName='') => `"${entity.Name}" [${type}]."${fieldName}" [${fieldType}] => "${linkedName}"` // DEBUG

// Simple cache
class Cache {
    constructor() { this.map = new Map() }
    cache( key, valueFunc ) {
        if ( ! this.map.has(key) ) this.map.set(key, valueFunc())
        return this.map.get(key)
    }
}

const entities = {}, entityRefs = {}                        // entities[] contains EntityProxy objects, not Promises
const _thitf = new Cache(), _thrf = new Cache(), _infro = new Cache(), _itf = new Cache()

const getFieldObject            = (type, fieldName) => schema.typeObjectsByName[type].fieldObjects.find( (f) => f.title===fieldName )
const typeHasRulesField         = (type           ) => _thrf. cache( type, () => getFieldObject(type, rulesField     ) )
const typeHasIsTemplateField    = (type           ) => _thitf.cache( type, () => getFieldObject(type, isTemplateField) )
const isNameFieldReadOnly       = (type           ) => _infro.cache( type, () => isFieldReadOnly(type, 'Name') )

const isFieldReadOnly = (type, fieldName) => {
    const fieldObject = getFieldObject(type, fieldName)
    return fieldObject && fieldObject.isReadOnly
}

// Should the fieldObject be treated as the "Title" field for its type?
const isTitleField = (fieldObject) => _itf.cache( fieldObject, () => {
    if( fieldObject.title===titleField ) return true                        // fieldObject is THE canonical Title field
    const  titleF = getFieldObject(fieldObject.holderType, titleField)      // Does the type have a canonical Title field?
    return titleF ? false : fieldObject.title.match(/\btitle\b$/i)          // If not, is the fieldName "close enough" to be the type's title field?
})

// Is an entity a designated template entity? I.e. does it have an "Is Template" field that is truthy?
const _iate = new Cache()
async function isaTemplateEntity( type, entity ) {
    if ( !entity ) return false
    const key = entityKey(type, entity.Id)
    return _iate.cache( key, async () => {
        if ( !typeHasIsTemplateField(type) ) return false
        if ( !(isTemplateField in entity) )
            entity = await getEntityProxy(type, entity.Id)           // Get full entity with isTemplateField
        // log( `isaTemplateEntity( ${key} ):  ${!! entity[isTemplateField]}` )
        return !! entity[isTemplateField]
    })
}

// Concatenate substr to str, but only if it isn't already in str
function addUniqueSubtring( str, substr ) {
    if ( str==null )                 return substr
    if ( str.indexOf(substr) > -1 )  return str
    return str + substr
}

// Get array of (most) field names in a type
const _gft = new Cache()
const getFieldsForType = (type) => _gft.cache( type, () =>
    [  'Id', 'Name', 'Public Id',
        ...( schema.typeObjectsByName[type].fieldObjects
            .filter( (fieldObject) => !fieldObject.isDeleted && fieldObject.type!=='fibery/Button' && !fieldObject.isReadOnly && fieldObject.type!=='Collaboration~Documents/Reference' )
            .map(    (fieldObject) => fieldObject.title ) )
    ])

// Is the field a "one-to-*" relation? (ie., is the other side NOT a collection)
const _iotr = new Cache()
const is_OneToX_relation     = (fieldObject) => _iotr.cache( fieldObject.id, () => {
    if ( !fieldObject.relation ) return false
    const relatedType        = fieldObject.type, relatedTypeSchema = schema.typeObjectsByName[relatedType]
    assert( relatedTypeSchema, `Didn't find relatedTypeSchema for [${relatedType}]` )
    const relatedFieldObject = relatedTypeSchema.fieldObjects.find( (fieldObject2) => fieldObject2['relation']===fieldObject.relation )
    assert( relatedFieldObject, `Didn't find relatedType fieldObject for [${relatedType}] "${fieldObject.title}"` )
    // log( `Related fieldObject for [${relatedType}] "${fieldObject.title}"`, relatedFieldObject )
    return !relatedFieldObject.isCollection
})

// Manage which fields to ignore
const _ignoreFields = {}        // key = typeName
function ignoreField(type, fieldName, ignoreIt=null) {
    const  ignore = _ignoreFields[type]
    if ( ignoreIt==null ) return ignore && ignore[fieldName]
    if (   ignore==null ) _ignoreFields[type] = {}
    log( `🤷‍♂️Ignoring field [${type}] "${fieldName}"` )
    _ignoreFields[type][fieldName] = ignoreIt
}

// Map a fieldId (from any type) to its fieldObject
const schemaFieldObjects = Object.fromEntries(
    schema.typeObjects.flatMap( (typeObject) =>
        typeObject.fieldObjects.map( (fieldObject) => [fieldObject.id, fieldObject] )
))

// Map a fieldObject to its linkRule operand fieldObjects (for auto-linked relation fields)
const _lrf                          = new Map()
const linkRuleFields                = (fieldObject) => {
    function getLinkRuleFields() {
        const debugInfo             = `getLinkRuleFields [${fieldObject.holderType}]."${fieldObject.name}" (${fieldObject.id})`
        const relatedFieldObject    = fieldObject.relatedFieldObject
        assert( relatedFieldObject, `❓${debugInfo} - null relatedFieldObject`)
        const linkRule              = fieldObject.linkRule || relatedFieldObject.linkRule
        assert( linkRule,`❓${debugInfo} - null linkRule`)
        assert( linkRule['operands'] && linkRule.operands[0], `${debugInfo} - null linkRule.operands[0]` )
        const op = linkRule.operands[0]
        // assert( op,                         `${debugInfo} - linkRule.operands[0] is ${op}`)
        // assert( op['operator'] === '=',     `${debugInfo} - op.operator is "${op['operator']}"` )
        // assert( op['expression'],           `${debugInfo} - null op.expression` )
        // assert( op['relationExpression'],   `${debugInfo} - null op.relationExpression` )
        // [0] corresponds to the linked expression field in the current type
        // log( `[${fieldObject.type}]."${fieldObject.title}" linkRule: `, linkRule )
        const opExpr_fob = schemaFieldObjects[op.expression[0]], opRelExpr_fob = schemaFieldObjects[op.relationExpression[0]]
        // assert( opExpr_fob,    `${debugInfo} - op.expression fieldId not found in schemaFieldObjects: ${opExpr_fob}` )
        // assert( opRelExpr_fob, `${debugInfo} - op.relationExpression fieldId not found in schemaFieldObjects: ${opRelExpr_fob}` )
        return  opExpr_fob.holderType===fieldObject.holderType ?
                [opExpr_fob, opRelExpr_fob] : [opRelExpr_fob, opExpr_fob]
    }
    if ( ! _lrf.has(fieldObject) ) _lrf.set(fieldObject, getLinkRuleFields() )
    return _lrf.get(fieldObject)
}

// Fibery entity proxy
class EntityProxy {
    constructor( type, isClone ) {
        this.type           = type
        this.entity         = null
        this.isClone        = isClone
        this.myClone        = null
        this.fieldValues    = {}            // Field values to set (by field name)
        this.collections    = {}            // Collections  to set (by collection name)
        this.fieldObjects   = schema.typeObjectsByName[type].fieldObjects
    }
    setEntity( entity ) {
        this.key            = entityKey(this.type, entity.Id)
        return this.entity  = entity
    }

    get Id()   { return this.entity['Id']   }
    get Name() { return this.entity['Name'] }

    // Set a field value
    setField( fieldObject, value, isClone=null ) {
        const fieldName = fieldObject.title
        if ( value && value['Id'] ) value = value.Id
        log( `  setField( "${fieldName}", ${isClone} ) => ${JSON.stringify(value)}` )
        this.fieldValues[fieldName] = value
        if ( value && !isClone && fieldObject['relation'] && !fieldObject.typeObject.isEnum && fieldObject.type!=='fibery/user' )
            this.addReference(fieldObject.type, value, fieldName, null)
    }

    // Add children to a collection
    addToCollection( fieldObject, children, isClone=null ) {
        const collecType    = fieldObject.type, collecName = fieldObject.title
        const collection    = this.collections[collecName] = this.collections[collecName] || []
        const addRef        = !(isClone || fieldObject.typeObject.isEnum || collecType==='fibery/user')
        log( `  addToCollection( "${fieldObject.title}", ${JSON.stringify(children)}, ${isClone} )  [${this.key}] / ${addRef}` )
        if ( typeof children==='string' ) children = [{Id: children}]
        for( const {Id} of children ) {
            collection.push(Id)
            if ( addRef ) this.addReference(collecType, Id, collecName, collection.length - 1)
        }
    }

    // Remember all references to non-clone (template) entities, so if one gets cloned
    // then all its refs can be updated to link to the clone instead
    addReference( type, id, fieldName, idx ) {
        const key = entityKey(type, id)                                 // referenced entity
        log( `  👉addReference( from [${this.key}]."${fieldName}", ${idx} ) => ${key}` )
        entityRefs[key] = entityRefs[key] || []
        entityRefs[key].push({ entity: this, fieldName, idx })     // 'this' is the referencer entity
    }

    // if this (template) entity got cloned, update all references to it, so they link to the clone instead
    // static async updateReferences( me, clone ) {
    updateReferences( clone ) {
        const templateKey = this.key
        assert( entityRefs[templateKey]!==true, `updateReferences: already completed for [${templateKey}] => ${clone.Id}` )
        if ( !entityRefs[templateKey] ) return
        log( `  🏹updateReferences( [${templateKey}] ) => ${clone.Id}\n` )
        for( const {entity, fieldName, idx} of entityRefs[templateKey] ) {      // entity is the referencer
            if ( idx==null )
                entity.fieldValues[fieldName] = clone.Id                        // Not a collection: OneToX relation
            else {
                assert( entity.collections && entity.collections[fieldName] instanceof Array, `updateReferences: null collection [${entity.type}]."${fieldName}" for "${entity.Name}"` )
                entity.collections[fieldName][idx] = clone.Id                   // Collection
            }
        }
        entityRefs[templateKey] = true
    }
}

// Create an EntityProxy for a Fibery entity
async function make_EntityProxy( type, id, entityPromise, isClone=null ) {
    const ep            = new EntityProxy(type, isClone)
    function setEntityId( id ) {
        const key       = entityKey(type, id)
        assert( !entities[key], `make_EntityProxy: entity already exists: [${key}]` )
        entities[key]   = ep
    }
    if ( id ) setEntityId(id)                   // Entity already exists
    const entity        = await entityPromise
    ep.setEntity(entity)                        // Now entity definitely exists
    if ( !id ) setEntityId(entity.Id)           // Get Id from created entity
    return ep
}

// Get the EntityProxy for a Fibery entity (or make one)
async function getEntityProxy( type, id ) {
    const key = entityKey(type, id)
    if ( key in entities ) return entities[key]
    log( `🟩getEntity ${key}` )
    return make_EntityProxy(type, id, fibery.getEntityById(type, id, getFieldsForType(type)))
}

// If entity is a clone or has a clone, then return the clone; else return null
async function getExistingCloneOf( type, id ) {
    assert( typeof type==='string', 'getExistingCloneOf: type is not string' )
    assert( typeof id  ==='string', 'getExistingCloneOf: id is not string' )
    const key = entityKey(type, id), entity = entities[key]
    if ( !entity ) return null
    if ( entity.isClone ) return entity
    return entity.myClone               // null if entity has no clone, else Promise from fibery.create
}

// Get a template entity's existing clone, or create it
async function getOrCreateClone( type, template, context ) {
    assert( template, `getOrCreateClone: null template ⚡ ${context}` )
    log( `getOrCreateClone [${type}] ${template['Id']} ⚡ ${context}` )
    const key        = entityKey(type, template.Id)
    let   subject    = await getExistingCloneOf(type, template.Id)
    if ( subject ) return subject                            // Clone exists
    // No clone exists for template, so make one
    log( `🔹Cloning "${key}" ⚡ ${context}` )
    if ( !(template instanceof EntityProxy) ) template = await getEntityProxy(type, template.Id)
    // Create a new clone
    const values = { Name: template.Name+' copy' }
    if ( typeHasRulesField(type) )
        values[rulesField] = addUniqueSubtring(template[rulesField], '[CLONE]')    // Inform Fibery Rules that this entity is (being) cloned
    else
        warn( `❌Type [${type}] is missing "${rulesField}" field` )
    template.myClone = make_EntityProxy(type, null, fibery.createEntity(type, values), true)    // Promise
    const clone      = await template.myClone
    return cloneEntityFromTemplate({ type, subject: clone, templateId: template.Id, context })
}

// Clone the subject entity from the template entity. This overwrites the subject's fields, although
// pre-existing subject collection items are not removed (in general the subject entity has been newly created).
// If templateId is not specified, get it from subject's templateField.
async function cloneEntityFromTemplate({ type, subject, templateId=null, context }) {
    log( `\n🍀cloneEntityFromTemplate: ${subject.Id} [${type}] "${subject.Name}" <= ${templateId} ⚡ ${context}` )
    const collectionFields = [], promises = []
    if ( !('fieldValues' in subject) ) subject = await getEntityProxy(type, subject.Id)
    assert( !subject['myClone'], `cloneEntityFromTemplate: subject has myClone` )
    subject.isClone     = true
    templateId          = templateId || subject.entity[templateField]['Id']
    assert( templateId, `Cannot clone "${subject.Name}" [${subject.key}] because "${templateField}" field is empty` )
    const template      = await getEntityProxy(type, templateId)
    assert( 'key' in template, `cloneEntityFromTemplate: "key" not in template` )
    log( `  template: [${template.key}] "${template.Name}"` )
    template.myClone    = subject

    // Copy fields from template to subject
    for ( const fieldObject of subject.fieldObjects ) {
        const fieldName = fieldObject.title, fieldType = fieldObject.type, fieldValue = template.entity[fieldName]
        if( ignoreField(type, fieldName) ) {
            continue
        } else if ( fieldName===templateField ) {
            subject.setField( fieldObject, null )                           // A newly cloned entity should not have a Template set (could re-trigger cloning)
        } else if ( fieldObject.typeObject.isEnum ) {
            if ( !fieldValue ) continue
            if ( fieldObject.cardinality===':cardinality/many-to-many' )
                subject.addToCollection(fieldObject, fieldValue)            // Copy Multiselect values
            else if ( fieldValue['Name'] )
                subject.setField(fieldObject, fieldValue.Name)              // Copy Single-Select value
            else
                throw Error(`Unhandled Enum: [${template.key}]."${fieldName}" = "${JSON.stringify(fieldValue)}"`)
        } else if ( fieldType==='comments/comment' || fieldType==='Collaboration~Documents/Reference' || fieldType==='fibery/view' ) {
            continue                                                        // Ignore Comments
        } else if ( fieldObject.name==='Files/Files' ) {
            subject.files = fieldValue                                      // Handled later
        } else if ( fieldObject.type==='Collaboration~Documents/Document' ) {
            // Copy Rich Text
            const subjectSecret = subject.entity[fieldName]['Secret']
            assert( subjectSecret, `null subjectSecret: ${subject.key} . ${fieldName}` )
            promises.push(
                (async(subjectSecret) => {
                    const content = await fibery.getDocumentContent(fieldValue.Secret, 'json')
                    assert( content, `null Collaboration~Documents content for [${template.key}]."${fieldName}"` )
                    fibery.setDocumentContent(subjectSecret, content, 'json')
                })(subjectSecret))
        } else if ( is_OneToX_relation(fieldObject) && fieldObject.linkRule ) {
            // Auto-linked is_OneToX_relation: ignore this relation AND the field used for the link expression, as copying it would unlink it from the template entity
            const [ourExpresssionFieldObject] = linkRuleFields(fieldObject)
            ignoreField(type, ourExpresssionFieldObject.title, true)
        } else if ( fieldObject.isCollection ) {
            if ( fieldName===templateTargetsField )
                log( `Ignoring collection [${template.key}]."${fieldName}"` )
            else
                collectionFields.push(fieldObject)
        } else if ( fieldObject['relation'] ) {
            if ( !(fieldValue && fieldValue['Id']) ) continue
            if ( is_OneToX_relation(fieldObject) ) {
                // We must clone the related entity, because linking it to the subject would un-link it from the template entity
                log( `is_OneToX_relation: [${template.key}]."${fieldName}": `, fieldValue )
                promises.push(
                    (async(fieldObject, fieldValue) => {
                        const fieldName = fieldObject.title, fieldType = fieldObject.type
                        const clone     = await getOrCreateClone(fieldType, fieldValue, makeContext(type, subject, fieldName, fieldType))
                        subject.setField(fieldObject, clone.Id, true)
                    })(fieldObject, fieldValue))
            } else {
                subject.setField(fieldObject, fieldValue.Id)                // Not a OneToX_relation, so the linked entity can be linked to many
            }
        } else if ( fieldObject.isReadOnly ) {
            continue
        } else if ( fieldName==='Name' ) {
            subject.setField(  fieldObject, fieldValue==null ? '' : fieldValue.replace(/\s?\btemplate\b/gi, '') )    // Remove "template" from Name
        } else if ( fieldName==='Rank' ) {
            subject.setField(  fieldObject, (fieldValue || 0) + 10000)
        } else if ( fieldName===isTemplateField ) {
            subject.setField(  fieldObject, false )                         // A newly cloned entity should not be a template
        } else if ( fieldName===rulesField ) {
            subject.setField(  fieldObject, addUniqueSubtring(fieldValue, '[CLONE]') )  // Inform Fibery Rules that entity is (being) cloned
        } else if ( isNameFieldReadOnly(type) && isTitleField(fieldObject) && fieldValue ) {
            subject.setField(  fieldObject, fieldValue.replace(/\s?\btemplate\b/gi, '')+' copy' )  // If Name field is a Formula, add 'copy' to the Title field if it exists
        } else if ( fieldObject.typeObject.isPrimitive ) {
            subject.setField(  fieldObject, fieldValue )
        } else
            throw Error( `Field not handled by cloneEntityFromTemplate: [${type}] "${fieldName}"` )
    }

    // Copy or Clone the template's collections (including Assignees)
    for( const fieldObject of collectionFields ) {
        const collecType = fieldObject.type, collecName = fieldObject.title, collection = template.entity[collecName]
        log( `Processing collection "${collecName}" [${collecType}] ⚡ ${context}` )
        if ( !(collection && collection['length'] > 0) ) continue
        // Each child (member) of the template collection gets cloned if a template entity or OneToX relation,
        // else it just gets linked (copied) to the subject's collection.
        // OneToX relations must be cloned, because linking them to the subject would un-link them from the template entity.
        async function cloneOrCopyCollecChild(fieldObject, collecChild) {
            const collecType = fieldObject.type, collecName = fieldObject.title
            if ( is_OneToX_relation(fieldObject) || await isaTemplateEntity(collecType, collecChild) ) {
                // Clone the template child
                const childClone = await getOrCreateClone(collecType, collecChild, makeContext(type, subject, collecName, collecType, collecChild.Name))
                subject.addToCollection(fieldObject, childClone.Id, true)
            } else {
                // If child already has a clone, use that; else just link the child to the subject
                const childClone = await getExistingCloneOf(collecType, collecChild.Id)
                subject.addToCollection(fieldObject, childClone ? childClone.Id : collecChild.Id, childClone!=null)
            }
        }
        collection.map( (collecChild) => promises.push( cloneOrCopyCollecChild(fieldObject, collecChild) ) )
    }

    // Wait for all operations to complete
    await Promise.all(promises)

    // Update all references to the template to refer instead to the clone
    template.updateReferences(subject)    // await EntityProxy.updateReferences(template, subject)
    return subject
}

const promises = []

// Update a Fibery entity's simple fields
function updateSimpleFields( entity ) {
    log( `🟣updateSimpleFields: [${entity.key}]  "${entity.Name}"` )
    if ( Object.keys(entity.fieldValues).length < 1 ) return
    const fieldValues = Object.fromEntries( Object.entries(entity.fieldValues)
        .filter( ([fieldName]) => !ignoreField(entity.type, fieldName) ))   // exclude ignored fields
    log( `fieldValues (${entity.key}):`, entity['fieldValues'] )
    promises.push( fibery.updateEntity(entity.type, entity.Id, fieldValues) )
}

// Update a Fibery entity's collections
function updateCollections( entity ) {
    log( `🟣updateCollections: [${entity.key}]  "${entity.Name}"` )
    const collections = Object.entries(entity.collections)
    for( const [collecName, collection] of collections ) {
        log( `collection "${collecName}"  [${entity.key}]  "${entity.Name}"`, collection )
        assert( collection instanceof Array, `updateCollections [${entity.key}]  collection "${collecName}" is not Array:\n${JSON.stringify(collection)}` )
        for( const collecChildId of collection ) {
            assert( typeof collecChildId==='string', `updateCollections: childId is not string:\n${collecChildId}` )
            // log( `  adding:  ${collecChildId} => [${entity.key}]."${entity.Name}"` )
            promises.push( fibery.addCollectionItem( entity.type, entity.Id, collecName, collecChildId ) )
        }
    }
}

// Update a Fibery entity's File attachments
function updateFiles( entity ) {
    if ( !(entity.files && entity.files.length>0) ) return
    log( `🟣updateFiles: [${entity.key}]  "${entity.Name}" (${entity.files.length})` )
    for( const file of entity.files) {
        promises.push(
            fibery.getEntityById('fibery/file', file.id, ['Secret', 'Name', ])      // 'Content Type'
            .then( (file) => {
                const fileUrl = fiberyAccountHostName + '/api/files/' + file.Secret
                // log( `  file "${file2.Name}" ${file2['Content Type']} => ${fileUrl}` )
                return fibery.addFileFromUrl(fileUrl, file.Name, entity.type, entity.Id, {Authorization: 'Token '+API_TOKEN})
            })
        )
    }
}

// Call an updater function for all clones
function updater( updaterFunc ) {
    Object.values(entities)
        .filter( (entity) => entity.isClone )
        .map   ( (entity) => updaterFunc(entity) )
}

// MAIN: Clone all subject entities (clones) from their linked template entities
// The subject/clone entities exist, and their Template fields must link to their template entities to clone them from
try {
    for( const subject of args.currentEntities ) {
        await cloneEntityFromTemplate({ type: subject.type, subject, context: '<TOP>' })
        log( '\n🟣Updating entities' )
        updater(updateCollections)
        updater(updateFiles)
        updater(updateSimpleFields)
        await Promise.all(promises)
    }
}
catch(err) {
    log( '❌CAUGHT:', err )
    throw err
}