import type { NonProjectDemandRow } from '../types';
import { currentWeekStart, weekLabel } from './arrayParser';

interface ProjectWorkRow {
  projectName: string;
  weeks: number[];
  isActive: boolean;
}

function weeklyHours(values: number[], horizon: number): number[] {
  return Array.from({ length: horizon }, (_, week) => values[week] ?? 0);
}

export async function downloadWorkloadWorkbook(
  horizon: number,
  projects: ProjectWorkRow[],
  otherWork: NonProjectDemandRow[],
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const weekHeaders = Array.from({ length: horizon }, (_, week) => weekLabel(week));

  function addSheet(name: string, details: string[], rows: Array<{ labels: string[]; weeks: number[]; active: boolean }>, color: string) {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', xSplit: details.length + 1, ySplit: 1 }] });
    sheet.properties.tabColor = { argb: color };
    sheet.addRow([...details, 'Status', ...weekHeaders, 'Total hours']);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    sheet.getRow(1).height = 26;
    sheet.getRow(1).alignment = { vertical: 'middle' };
    details.forEach((_, index) => { sheet.getColumn(index + 1).width = index === 0 ? 42 : 30; });
    sheet.getColumn(details.length + 1).width = 13;
    weekHeaders.forEach((_, index) => { sheet.getColumn(details.length + index + 2).width = 14; });
    sheet.getColumn(details.length + horizon + 2).width = 16;
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: details.length + horizon + 2 } };

    for (const row of rows) {
      const hours = weeklyHours(row.weeks, horizon);
      sheet.addRow([...row.labels, row.active ? 'Active' : 'Inactive', ...hours, hours.reduce((sum, value) => sum + value, 0)]);
    }
  }

  addSheet('Project work', ['Project'], projects.map((row) => ({
    labels: [row.projectName], weeks: row.weeks, active: row.isActive,
  })), 'FF2F7EC7');
  addSheet('Non-project work', ['Category', 'Activity', 'Description'], otherWork.map((row) => ({
    labels: [row.categoryName, row.subcategoryName ?? 'General', row.description ?? ''],
    weeks: row.weeks,
    active: row.isActive !== false,
  })), 'FF4E9DD0');

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `my-workload-${horizon}-weeks-${currentWeekStart().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}