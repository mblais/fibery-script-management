#!/usr/bin/env bash
# Automate Fibery Automations

declare autoId=6510b876ce7b8cf2eff80485     # Automation Id

declare FiberyAPIkey='e3f705b1.5d343402dae27d46f53965264d009909ce6'
escape() { perl -e '$_=do{local $/; <STDIN>}; s/\t/\\t/g; s/"/\\"/g; s/\n/\\n/g; print'; }
# sed -E '/^\s*#/ d; s/\s+#.*//; s/^\s*//; s/\s+$//; s/\s+/ /g;' | tr '\n' ' ' | escape

# Enable/disable automation:
declare enable=true   # true/false
curl --silent \
    -X 'PUT' -H "Authorization: Token $FiberyAPIkey" -H 'Content-Type: application/json' \
    "https://jrp-zoho.fibery.io/api/automations/auto-rules/$autoId" \
    --compressed --data-raw "{\"enabled\":$enable}"

# Get Automation:
# curl "https://jrp-zoho.fibery.io/api/automations/auto-rules/$autoId" \
#   -H 'authority: jrp-zoho.fibery.io' \
#   -H 'accept: application/json' \
#   -H 'accept-language: en-US,en;q=0.9' \
#   -H 'content-type: application/json; charset=utf-8' \
#   -H 'cookie: ...' \
#   -H 'baggage: sentry-release=1.0.525-stable.n32808.hfb19d0c,sentry-transaction=%3Apage%2Ftype,sentry-public_key=7e1d91a8691f4965bc0f8f363472e157,sentry-trace_id=e1c044eac2544e0f8048299b1feb69dc,sentry-sample_rate=0.05' \
#   -H 'referer: https://jrp-zoho.fibery.io/fibery/space/REPORTS/database/Call_Stats/automations/rule/64d56ed42f4fa8eee0d809d6/actions' \
#   -H 'sec-ch-ua: "Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"' -H 'sec-ch-ua-mobile: ?0' -H 'sec-ch-ua-platform: "Windows"' -H 'dnt: 1' \
#   -H 'sec-fetch-dest: empty' -H 'sec-fetch-mode: cors' -H 'sec-fetch-site: same-origin' -H 'sentry-trace: e1c044eac2544e0f8048299b1feb69dc-bf53992720882dcb-0' -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36' \
#   --compressed
#
# {
# RESPONSE:
: <<_EOF_
  "lastRun": {
    "status": "COMPLETED",
    "startDate": "2023-10-14T01:10:06.667Z"
  },
  "name": "Associate Calls",
  "type": "AUTO",
  "enabled": true,
  "accountName": "jrp-zoho.fibery.io",
  "ownerId": "773f69b3-f336-491e-847b-b9a7c7d682c5",
  "typeId": "d72d1b10-3721-11ee-8557-43b786f93c6e",
  "actions": [
    {
      "meta": {
        "name": "Link Calls",
        "args": [
          {
            "id": "items",
            "type": "fibery/field",
            "meta": {
              "typeId": "d72d1b10-3721-11ee-8557-43b786f93c6e",
              "fieldId": "004bdf2c-1624-48bc-8338-d25d8da43eb8"
            },
            "name": "Calls",
            "description": "Link Calls to entity"
          }
        ]
      },
      "id": "b4f7db6a-948c-4304-8d3d-c96c2276de98",
      "action": "link-0dd85080-3722-11ee-8557-43b786f93c6e",
      "args": {
        "items": {
          "type": "formula",
          "value": {
            "expression": {
              "q/from": [
                "entityQuery_24aa46f9-ccb3-43bd-93a6-f81a0e734570"
              ],
              "q/select": {
                "fibery/id": [
                  "862fd7d0-a3a8-4adf-b814-3aa5893ad042"
                ]
              },
              "q/limit": "q/no-limit",
              "q/where": [
                "=",
                [
                  "q/if",
                  [
                    "=",
                    [
                      "triggeredEntity",
                      "74c429cc-e03c-4085-b8cf-67213df7c72b",
                      "ea5caeb8-da03-41be-ac70-aa444d128c96"
                    ],
                    "$formulaParam1"
                  ],
                  [
                    "and",
                    [
                      "and",
                      [
                        "and",
                        [
                          "and",
                          [
                            "or",
                            [
                              "q/null-or-empty?",
                              [
                                "e8ee59ba-75dd-4a75-815b-ed656079e62e"
                              ]
                            ],
                            [
                              "=",
                              [
                                "e8ee59ba-75dd-4a75-815b-ed656079e62e"
                              ],
                              "$formulaParam2"
                            ]
                          ],
                          [
                            "=",
                            [
                              "16b586f9-6ad4-4655-a4fa-698785f73091",
                              "86666198-faa1-49b7-92f2-e8e6907726d9"
                            ],
                            [
                              "triggeredEntity",
                              "4749514f-2707-4a6a-bf23-52a349d1a41d",
                              "86666198-faa1-49b7-92f2-e8e6907726d9"
                            ]
                          ]
                        ],
                        [
                          ">",
                          [
                            "0212607d-3296-4f73-b257-dbfbbbd0724c"
                          ],
                          [
                            "triggeredEntity",
                            "ea6110d8-94bc-4f93-b0c4-b303aa390ea8"
                          ]
                        ]
                      ],
                      [
                        ">=",
                        [
                          "0212607d-3296-4f73-b257-dbfbbbd0724c"
                        ],
                        [
                          "q/start",
                          [
                            "triggeredEntity",
                            "574d4d82-588e-46c9-89c9-6f0085030f20"
                          ]
                        ]
                      ]
                    ],
                    [
                      "<",
                      [
                        "0212607d-3296-4f73-b257-dbfbbbd0724c"
                      ],
                      [
                        "q/end",
                        [
                          "triggeredEntity",
                          "574d4d82-588e-46c9-89c9-6f0085030f20"
                        ],
                        "$formulaParam3"
                      ]
                    ]
                  ],
                  [
                    "and",
                    [
                      "and",
                      [
                        "and",
                        [
                          "and",
                          [
                            "=",
                            [
                              "f73dc700-acb1-4fe2-8655-355c8a2375e8",
                              "7ae14170-24f6-42a5-b973-3f6e396ba44d"
                            ],
                            [
                              "triggeredEntity",
                              "acb8b8da-a33c-4443-8605-a90f98b4cce9",
                              "7ae14170-24f6-42a5-b973-3f6e396ba44d"
                            ]
                          ],
                          [
                            "or",
                            [
                              "q/null-or-empty?",
                              [
                                "e8ee59ba-75dd-4a75-815b-ed656079e62e"
                              ]
                            ],
                            [
                              "=",
                              [
                                "e8ee59ba-75dd-4a75-815b-ed656079e62e"
                              ],
                              "$formulaParam4"
                            ]
                          ]
                        ],
                        [
                          ">",
                          [
                            "0212607d-3296-4f73-b257-dbfbbbd0724c"
                          ],
                          [
                            "triggeredEntity",
                            "ea6110d8-94bc-4f93-b0c4-b303aa390ea8"
                          ]
                        ]
                      ],
                      [
                        ">=",
                        [
                          "0212607d-3296-4f73-b257-dbfbbbd0724c"
                        ],
                        [
                          "q/start",
                          [
                            "triggeredEntity",
                            "574d4d82-588e-46c9-89c9-6f0085030f20"
                          ]
                        ]
                      ]
                    ],
                    [
                      "<",
                      [
                        "0212607d-3296-4f73-b257-dbfbbbd0724c"
                      ],
                      [
                        "q/end",
                        [
                          "triggeredEntity",
                          "574d4d82-588e-46c9-89c9-6f0085030f20"
                        ],
                        "$formulaParam5"
                      ]
                    ]
                  ]
                ],
                "$formulaParam6"
              ]
            },
            "params": {
              "$formulaParam1": "MetaUser",
              "$formulaParam2": "",
              "$formulaParam3": true,
              "$formulaParam4": "",
              "$formulaParam5": true,
              "$formulaParam6": true
            }
          }
        }
      },
      "ownerId": "773f69b3-f336-491e-847b-b9a7c7d682c5",
      "app": "fibery"
    },
    {
      "meta": {
        "name": "Update",
        "args": [
          {
            "id": "fields",
            "type": "fibery/fields",
            "name": "Fields",
            "meta": {
              "typeId": "d72d1b10-3721-11ee-8557-43b786f93c6e"
            },
            "description": "Select Call Stats fields you want to change"
          }
        ]
      },
      "id": "2db46e74-d493-4ca8-9dc4-bbc6696d2bfe",
      "action": "update-d72d1b10-3721-11ee-8557-43b786f93c6e",
      "args": {
        "fields": {
          "type": "value",
          "value": {
            "05d01228-134c-4e71-9841-3b99cc952217": {
              "type": "formula",
              "value": {
                "expression": [
                  "q/date-time",
                  "$formula-now-date-time-placeholder"
                ],
                "params": {
                  "$formula-now-date-time-placeholder": "$formula-now-date-time-placeholder"
                }
              }
            },
            "21fa3e5e-9eec-435c-942d-378fb2409df6": {
              "type": "empty"
            }
          }
        }
      },
      "ownerId": "773f69b3-f336-491e-847b-b9a7c7d682c5",
      "app": "fibery"
    }
  ],
  "triggers": [
    {
      "trigger": "updated",
      "app": "fibery",
      "args": {
        "updatedField": [
          "21fa3e5e-9eec-435c-942d-378fb2409df6"
        ],
        "filter": {
          "filterExpression": [
            "and",
            [
              "=",
              [
                "21fa3e5e-9eec-435c-942d-378fb2409df6"
              ],
              "$where1"
            ],
            [
              "q/in",
              [
                "2c9820fb-add8-4bb1-8a0e-6fcc759608e7",
                "f981bf65-ee33-4efa-b217-db6e247b305b"
              ],
              "$where2"
            ]
          ],
          "params": {
            "$where1": true,
            "$where2": [
              "22ad6562-36df-11ee-8bc5-57038b874cac",
              "27183992-36df-11ee-8bc5-57038b874cac"
            ]
          }
        }
      },
      "id": "850579a4-094a-429e-a163-d6befd7aed06"
    }
  ],
  "created": "2023-08-10T23:12:20.002Z",
  "id": "64d56ed42f4fa8eee0d809d6"
}
_EOF_

# Enable/Disable Automation:
# curl 'https://jrp-zoho.fibery.io/api/automations/auto-rules/6510b876ce7b8cf2eff80485' \
#   -X 'PUT' \
#   -H 'authority: jrp-zoho.fibery.io' \
#   -H 'accept: application/json' \
#   -H 'accept-language: en-US,en;q=0.9' \
#   -H 'content-type: application/json; charset=utf-8' \
#   -H 'cookie: _ga=GA1.2.1853867331.1668467195; intercom-device-id-ejb71ydt=f4a12149-1b80-4697-aa24-82c77353e47a; site.sid=s%3AsegBmYeworlOYW_tL_E5MHL6A5yU2Ks5.ZwtVC8hInvoICYcWjM%2B%2FuEECRf05mF407RF%2BxccVWI4; connect.sid=s%3ARSXRRzSAB8jAbJSu_-NyFJJ0FsAtb7xY.hetUGFr2LDKjGEhmHlv19fByGUmoJrwGv0va8HjFh7A; intercom-session-ejb71ydt=L0dQZTNuUmxDa1BuS0I0WEhURTBiZXA3NS9pSW1Ydis2OE1VR0EyVVNNSmtJdzArNGU0eEwrM0ZmTGl1bUxBay0tNHB0VEg3dHNqV3MzK1JoYmNVcVpmQT09--138cca85971af13f7eb531ea91863fce79ac9fac' \
#   -H 'dnt: 1' \
#   -H 'origin: https://jrp-zoho.fibery.io' \
#   -H 'referer: https://jrp-zoho.fibery.io/fibery/space/REPORTS/database/Call_Stats/automations/rule/6510b876ce7b8cf2eff80485/actions' \
#   -H 'sec-ch-ua: "Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"' \
#   -H 'sec-ch-ua-mobile: ?0' \
#   -H 'sec-ch-ua-platform: "Windows"' \
#   -H 'sec-fetch-dest: empty' \
#   -H 'sec-fetch-mode: cors' \
#   -H 'sec-fetch-site: same-origin' \
#   -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36' \
#   --data-raw '{"enabled":true}' \
#   --compressed

# Save Automation:
# curl 'https://jrp-zoho.fibery.io/api/automations/auto-rules/6510b876ce7b8cf2eff80485' \
#   -X 'PUT' \
#   -H 'authority: jrp-zoho.fibery.io' \
#   -H 'accept: application/json' \
#   -H 'accept-language: en-US,en;q=0.9' \
#   -H 'content-type: application/json; charset=utf-8' \
#   -H 'cookie: _ga=GA1.2.1853867331.1668467195; intercom-device-id-ejb71ydt=f4a12149-1b80-4697-aa24-82c77353e47a; site.sid=s%3AsegBmYeworlOYW_tL_E5MHL6A5yU2Ks5.ZwtVC8hInvoICYcWjM%2B%2FuEECRf05mF407RF%2BxccVWI4; connect.sid=s%3ARSXRRzSAB8jAbJSu_-NyFJJ0FsAtb7xY.hetUGFr2LDKjGEhmHlv19fByGUmoJrwGv0va8HjFh7A; intercom-session-ejb71ydt=L0dQZTNuUmxDa1BuS0I0WEhURTBiZXA3NS9pSW1Ydis2OE1VR0EyVVNNSmtJdzArNGU0eEwrM0ZmTGl1bUxBay0tNHB0VEg3dHNqV3MzK1JoYmNVcVpmQT09--138cca85971af13f7eb531ea91863fce79ac9fac' \
#   -H 'dnt: 1' \
#   -H 'origin: https://jrp-zoho.fibery.io' \
#   -H 'referer: https://jrp-zoho.fibery.io/fibery/space/REPORTS/database/Call_Stats/automations/rule/6510b876ce7b8cf2eff80485/actions' \
#   -H 'sec-ch-ua: "Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"' \
#   -H 'sec-ch-ua-mobile: ?0' \
#   -H 'sec-ch-ua-platform: "Windows"' \
#   -H 'sec-fetch-dest: empty' \
#   -H 'sec-fetch-mode: cors' \
#   -H 'sec-fetch-site: same-origin' \
#   -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36' \
#   --data-raw $'{"name":"Mark Call Stats for Re-association","triggers":[{"trigger":"time-based","args":{"schedulerConfig":{"interval":1,"freq":4,"dtstart":"2023-09-24T23:42:00.000Z"},"filter":{"filterExpression":["and",["=",["2c9820fb-add8-4bb1-8a0e-6fcc759608e7","f981bf65-ee33-4efa-b217-db6e247b305b"],"$where1"],["=",["4749514f-2707-4a6a-bf23-52a349d1a41d","86666198-faa1-49b7-92f2-e8e6907726d9"],"$where2"]],"params":{"$where1":"188b3fd0-36df-11ee-8bc5-57038b874cac","$where2":"04e77681-7453-4d36-b84e-36c03c78bc3b"}}}}],"actions":[{"id":"0f92b055-611d-40c7-bd45-98c2eefbdc17","action":"script-d72d1b10-3721-11ee-8557-43b786f93c6e","args":{"script":{"type":"value","value":"// Mark Stats records to be re-associated to their underlying Zoho DB records\\r\\n   \\r\\nconst scriptSource = \'jrp-zoho.fibery.io/SPACE/REPORTS/DB/Reporting Period/Mark Stats for re-association.js\'\\r\\nconst DEBUG = true\\r\\nconst Stats_type = args.currentEntities[0].Type\\r\\nconst [, Reports_space, StatsDB] = Stats_type.match(/^([^/]+)\\\\/(.+)/)    // Separate entity Type into Space and Type\\r\\nconst Updated_field = `${Reports_space}/Updated`            // Time of last record updating (re-association) by script\\r\\nconst Sequence_field = `${Reports_space}/Sequence#`\\r\\nconst Reassociate_field = `${Reports_space}/Reassociate`\\r\\nconst Period_field = `${Reports_space}/Period`\\r\\nconst Period_Name = `enum/name`\\r\\n\\r\\nconst fibery = context.getService(\'fibery\')\\r\\nconst log = console.log, warn = console.log\\r\\nconst dbg = (...args) => { if (DEBUG) console.log(...args) }\\r\\nconst assert = (condition, msg) => { if (\u0021condition) throw Error(msg) }\\r\\nconst MS_PER_HOUR = 1000 * 60 * 60\\r\\nconst MS_PER_DAY = 24 * MS_PER_HOUR\\r\\n\\r\\nlet statsMarked = 0\\r\\nconst started = new Date()                            // Time of script execution start\\r\\nconst deadlineSeconds = 58                                    // max script execution time\\r\\nconst elapsedSeconds = () => Math.round((new Date() - started) / 100) / 10\\r\\nconst deadlineExceeded = () => elapsedSeconds() >= deadlineSeconds\\r\\nconst checkDeadline = () => { if (deadlineExceeded()) throw `😡 max script runtime (${deadlineSeconds}s) reached` }\\r\\nconst maxBatchLength = 1000\\r\\nconst batchEntityQueue = []\\r\\n\\r\\n// Queue a Fibery entity for batch update\\r\\nasync function updateEntity_queued(entity = null) {\\r\\n    if (entity)\\r\\n        batchEntityQueue.push(entity)\\r\\n    if (entity == null || batchEntityQueue.length >= maxBatchLength) {\\r\\n        if (batchEntityQueue.length == 0) return\\r\\n        // Submit all the batched entities\\r\\n        // log(\'batchEntityQueue:\', batchEntityQueue)\\r\\n        await fibery.updateEntityBatch(Stats_type, batchEntityQueue)\\r\\n        statsMarked += batchEntityQueue.length\\r\\n        batchEntityQueue.splice(0)\\r\\n    }\\r\\n}\\r\\n\\r\\n//---- MAIN ----\\r\\ntry {\\r\\n    // Script is triggered once per hour, and processes all StatsDB records whose Sequence# field\\r\\n    // corresponds to the hour of script execution.\\r\\n    const sequenceNum = started.getHours()\\r\\n    const now = started.toISOString()\\r\\n    const updateCutoff = new Date(started - 4 * MS_PER_HOUR)      // Cutoff: Only process Stats records whose last update time is more than 46 hours ago\\r\\n    log(`${started} - ${Reports_space}/${StatsDB} - ${scriptSource} - Sequence# ${sequenceNum}, cutoff ${updateCutoff}`)\\r\\n\\r\\n    // Find all Stats records with the right sequence#\\r\\n    const stats = await fibery.executeSingleCommand({\\r\\n        command: \'fibery.entity/query\', \'args\': {\\r\\n            query: {\\r\\n                \'q/from\': Stats_type,\\r\\n                \'q/select\': [\'fibery/id\'],\\r\\n                \'q/where\': [\\r\\n                    \'q/and\',\\r\\n                    [\'=\', [Reassociate_field], false],\\r\\n                    [\'=\', [Sequence_field], \'$sequenceNum\'],\\r\\n                    [\'q/in\', [Period_field, Period_Name], \'$periods\'],\\r\\n                    [\'q/or\',\\r\\n                        [\'<\', [Updated_field], \'$updateCutoff\'],\\r\\n                        [\'=\', [Updated_field], null],\\r\\n                    ]\\r\\n                ],\\r\\n                \'q/order-by\': [[[\'fibery/modification-date\'], \'q/asc\']],    // Least-recently-modified records first\\r\\n                \'q/limit\': 3000          // \'q/no-limit\',\\r\\n            },\\r\\n            params: {\\r\\n                \'$sequenceNum\': sequenceNum,\\r\\n                \'$updateCutoff\': updateCutoff,\\r\\n                \'$periods\': [\'Month\', \'Week\'],\\r\\n            }\\r\\n        }\\r\\n    })\\r\\n    log(`Found ${stats.length} ${StatsDB} records to mark for Update`)\\r\\n    for (const entity of stats) {\\r\\n        await updateEntity_queued({ id: entity[\'fibery/id\'], [Reassociate_field]: true })\\r\\n        checkDeadline()\\r\\n    }\\r\\n}\\r\\ncatch (err) {\\r\\n    log(err)\\r\\n    if (err instanceof Error) throw err\\r\\n}\\r\\nfinally {\\r\\n    await updateEntity_queued()\\r\\n    log(`✅ DONE - marked ${statsMarked} Stats records in ${elapsedSeconds()} seconds`)\\r\\n}"}}}]}' \
#   --compressed
