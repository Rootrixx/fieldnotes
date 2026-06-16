import type { ContextSheet, ContextSheetData } from '../types';

function joinValues(values: string[]) {
  return values.filter(Boolean).join('; ');
}

function formatBoolean(value: boolean) {
  return value ? 'Yes' : 'No';
}

function escapeCsvValue(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function addRow(rows: string[][], field: string, value: string | number | boolean | null) {
  const normalizedValue =
    typeof value === 'boolean' ? formatBoolean(value) : String(value ?? '');

  rows.push([field, normalizedValue]);
}

function getFinds(data: ContextSheetData) {
  return [
    data.finds.none ? 'None' : null,
    data.finds.pot ? 'Pot' : null,
    data.finds.bone ? 'Bone' : null,
    data.finds.flint ? 'Flint' : null,
    data.finds.stone ? 'Stone' : null,
    data.finds.burntStone ? 'Burnt stone' : null,
    data.finds.glass ? 'Glass' : null,
    data.finds.metal ? 'Metal' : null,
    data.finds.cbm ? 'CBM' : null,
    data.finds.wood ? 'Wood' : null,
    data.finds.leather ? 'Leather' : null,
    ...data.finds.other.filter(Boolean),
  ].filter(Boolean) as string[];
}

export function createContextSheetCsv(sheet: ContextSheet) {
  const rows: string[][] = [['Field', 'Value']];
  const { data } = sheet;

  addRow(rows, 'Title', sheet.title);
  addRow(rows, 'Created at', sheet.createdAt);
  addRow(rows, 'Updated at', sheet.updatedAt);
  addRow(rows, 'Source note count', sheet.noteCount);
  addRow(rows, 'Site code', data.site.code);
  addRow(rows, 'Site name', data.site.name);
  addRow(rows, 'Additional sheets', data.additionalSheets);
  addRow(rows, 'Context number', data.contextNumber);
  addRow(rows, 'Context type', data.contextType);
  addRow(rows, 'Trench', data.trench);
  addRow(rows, 'Plan number', data.planNumber);
  addRow(rows, 'Section number', data.sectionNumber);
  addRow(rows, 'Coordinates', data.coordinates);
  addRow(rows, 'Level', data.level);
  addRow(rows, 'Overlain by', joinValues(data.relationships.overlainBy));
  addRow(rows, 'Abutted by', joinValues(data.relationships.abuttedBy));
  addRow(rows, 'Cut by', joinValues(data.relationships.cutBy));
  addRow(rows, 'Filled by', joinValues(data.relationships.filledBy));
  addRow(rows, 'Same as', joinValues(data.relationships.sameAs));
  addRow(rows, 'Part of', joinValues(data.relationships.partOf));
  addRow(rows, 'Consists of', joinValues(data.relationships.consistsOf));
  addRow(rows, 'Overlies', joinValues(data.relationships.overlies));
  addRow(rows, 'Butts', joinValues(data.relationships.butts));
  addRow(rows, 'Cuts', joinValues(data.relationships.cuts));
  addRow(rows, 'Fill of', joinValues(data.relationships.fillOf));
  addRow(rows, 'Relationship uncertainty', data.relationships.uncertain);
  addRow(rows, 'Description', data.description);
  addRow(rows, 'Interpretation discussion', data.interpretationDiscussion);
  addRow(rows, 'Temporal sequence above', joinValues(data.temporalSequence.above));
  addRow(rows, 'Temporal sequence current', data.temporalSequence.current);
  addRow(rows, 'Temporal sequence below', joinValues(data.temporalSequence.below));
  addRow(rows, 'Finds', joinValues(getFinds(data)));
  addRow(rows, 'Small finds', data.smallFinds);
  addRow(rows, 'Samples', data.samples);
  addRow(rows, 'Building materials', data.buildingMaterials);
  addRow(rows, 'Recorder', data.recorder);
  addRow(rows, 'Date', data.date);
  addRow(rows, 'Initials', data.initials);

  return rows
    .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
    .join('\n');
}

export function getContextSheetCsvFileName(sheet: ContextSheet) {
  const fallbackName = sheet.data.contextNumber
    ? `context-${sheet.data.contextNumber}`
    : sheet.title || 'context-sheet';
  const safeName = fallbackName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${safeName || 'context-sheet'}.csv`;
}
