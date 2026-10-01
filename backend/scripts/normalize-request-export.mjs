import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '../demo-data'));
const inputPath = path.join(directory, 'newrequests1.csv');
const outputPath = path.join(directory, 'requests.csv');
const peoplePath = path.join(directory, 'people.csv');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = (rows.shift() ?? []).map((header) => header.replace(/^\uFEFF/, '').trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function value(row, ...keys) {
  for (const key of keys) {
    const candidate = row[key]?.trim();
    if (candidate) return candidate;
  }
  return '';
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const inputRows = parseCsv(fs.readFileSync(inputPath, 'utf8'));
const peopleRows = parseCsv(fs.readFileSync(peoplePath, 'utf8'));
const people = new Map();
for (const person of peopleRows) {
  const id = value(person, 'new_peopleid');
  if (!id) continue;
  for (const identity of [value(person, 'new_name'), value(person, 'new_email')]) {
    if (identity) people.set(identity.toLowerCase(), id);
  }
}

const headers = [
  'cr714__requestsid', 'cr714_additionalinformation', 'cr714_currentstate', 'cr714_delegates',
  'cr714_desiredfuturestate', 'cr714_disposition', 'cr714_howdiscovered', 'cr714_impact',
  'cr714_name', 'cr714_program', 'cr714_projecttype', 'cr714_shorttitle', 'cr714_sponsornameflat',
  'cr714_spotid', 'statuscode', 'statecode', 'cr714_whenneeded', 'cr714_whenneededjustification',
  'cr714_workflowstep', 'cr714_sponsor.azureactivedirectoryobjectid', 'clearpath_projectid',
  'cr714_requester', 'cr714_requestername', 'cr714_delegatename', 'createdon',
];
const unresolvedCreated = new Set();
const unresolvedDelegates = new Set();
const outputRows = inputRows.map((row) => {
  const createdBy = value(row, 'Created By');
  const requesterId = people.get(createdBy.toLowerCase());
  if (createdBy && !requesterId) unresolvedCreated.add(createdBy);
  for (const delegate of value(row, 'Delegates').split(';').map((item) => item.trim()).filter(Boolean)) {
    if (!people.has(delegate.toLowerCase())) unresolvedDelegates.add(delegate);
  }
  const workflowStep = value(row, 'WorkflowStep');
  return {
    cr714__requestsid: value(row, '_Requests'),
    cr714_additionalinformation: value(row, 'AdditionalInformation'),
    cr714_currentstate: value(row, 'CurrentState'),
    cr714_delegates: value(row, 'Delegates'),
    cr714_desiredfuturestate: value(row, 'DesiredFutureState'),
    cr714_disposition: value(row, 'Disposition'),
    cr714_howdiscovered: value(row, 'HowDiscovered'),
    cr714_impact: value(row, 'Impact'),
    cr714_name: value(row, 'ShortTitle'),
    cr714_program: value(row, 'Program'),
    cr714_projecttype: value(row, 'ProjectType'),
    cr714_shorttitle: value(row, 'ShortTitle'),
    cr714_sponsornameflat: value(row, 'Sponsor'),
    cr714_spotid: value(row, 'SPOTID'),
    statuscode: workflowStep === '1. Draft' ? 'Draft' : 'Submitted',
    statecode: '1',
    cr714_whenneeded: value(row, 'WhenNeeded'),
    cr714_whenneededjustification: value(row, 'WhenNeededJustification'),
    cr714_workflowstep: workflowStep,
    'cr714_sponsor.azureactivedirectoryobjectid': '',
    clearpath_projectid: '',
    cr714_requester: requesterId,
    cr714_requestername: createdBy,
    cr714_delegatename: value(row, 'Delegates'),
    createdon: value(row, 'Created On'),
  };
});

const text = [headers.join(','), ...outputRows.map((row) => headers.map((header) => escapeCsv(row[header])).join(','))].join('\n') + '\n';
fs.writeFileSync(outputPath, text, 'utf8');
console.log(`Normalized ${outputRows.length} requests into ${outputPath}.`);
console.log(`Mapped Created By identities: ${outputRows.filter((row) => row.cr714_requester).length}/${outputRows.length}.`);
console.log(`Validated Delegates identities across ${outputRows.filter((row) => row.cr714_delegates).length} requests.`);
console.log(`Unresolved Created By names preserved: ${[...unresolvedCreated].join('; ') || 'none'}.`);
console.log(`Unresolved Delegate names preserved: ${[...unresolvedDelegates].join('; ') || 'none'}.`);
