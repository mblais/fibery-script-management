//.fibery SCRIPTID=6328c4535a024260a5a13b42 ACTIONID=ebb22170-8523-40a8-b52c-1d1d690cbc96

// Create Call Log (and Call Log Entries) from Attendees info in entity Description

const CALL_LOG_TYPE = 'Users/Call Log'
const CALL_LOG_ENTRY_TYPE = 'Users/Call Log Entry'
const ENTRIES_FIELD = 'Call Log'
const CLIENTS_FIELD = 'Clients'

const fibery = context.getService('fibery')
const assert = (condition, msg) => { if(!condition) throw new Error(msg) }

for (const entity of args.currentEntities) {
    const client = entity['Client']
    const descriptionSecret = entity['Description'].Secret
    const content = await fibery.getDocumentContent(descriptionSecret, 'md')
    const text = find_H_content(2, content, 'ATTENDANCE')
    const users = text.match( /(?<=\[\[#@)[0-9a-f/-]{70,}.*/g )
    console.log('UserIds: ' + users.join('\n'))
    const mtgDate = findTopH1MtgDate(content)
    console.log('mtgDate: ' + mtgDate)

    // Create the Call Log
    const callLog = await fibery.createEntity(CALL_LOG_TYPE, {
        'Meeting Notes': entity.Id,
        'Date': mtgDate,
        'Name': client.Name + ' - ' + mtgDate
    })
    await fibery.addCollectionItem(CALL_LOG_TYPE, callLog.Id, CLIENTS_FIELD, client.Id)

    // Create and link a Call Log Entry for each attendee user
    for (const u of users) {
        const m = u.match( /^([0-9a-f/-]{70,})\s*(.*)/ )
        if( !m ) continue
        const uid = m[1].replace( /^.+?\//, '' )     // remove Type Id
        let status = null // default status
        if (m[2]) {
            status = m[2].match( /\by|[✅☑✔]/i ) ? 'Attended' :
                m[2].match( /\bn|[❌✖❎]/i ) ? 'No-Show' :
                m[2].match( /\bc/i ) ? 'Canceled' :
                null
        }
        const fields = { 'Call Log': callLog.Id, 'User': uid }
        if(status) fields['Status'] = status
        const entry = await fibery.createEntity(CALL_LOG_ENTRY_TYPE, fields)
    }
}

// Find and return the text content of the named H-section (level=2 means H2, etc)
function find_H_content(level, content, title) {
    const regex = new RegExp(`^#{${level}}[^#]\\s*\\W*\\s*${title}([\\s\\S]*?)\\n#{1,${level}}[^#]`, "ims")
    const m = content.match(regex)
    assert( m, `Did not find "${title}" H${level} section` )
    return m[1]
}

function findTopH1MtgDate(content) {
    try {
        const d = content.match(/^# (.*MEETING.*)/i)[1]
            .match(/(\d+[-\/.]\d+[-\/.]\d+)/)[1]
        return new Date(d).toISOString().substr(0,10)
    } catch (err) {
        throw new Error('Could not find Meeting H1 with Date in Meeting Notes')
    }
}
