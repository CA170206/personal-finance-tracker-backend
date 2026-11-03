/**
 * Robust RFC 4180 CSV Parser for FinTrack PRO
 * Handles quoted cells with commas, newlines, escaped quotes, and trimmed headers
 */
export const parseCSV = (csvText) => {
  if (!csvText || typeof csvText !== 'string') return [];

  const lines = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuotes = false;

  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        currentCell += '"';
        i++;
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (char === '\n' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  // Push last cell/row
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) {
      lines.push(currentRow);
    }
  }

  if (lines.length < 2) return [];

  const headers = lines[0].map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] !== undefined ? row[idx] : '';
    });
    rows.push(obj);
  }

  return rows;
};

export default { parseCSV };

