import Papa from 'papaparse';
import { ColumnMetadata, RawRow } from '../types/recsys';

export interface ParseResult {
  data: RawRow[];
  columns: string[];
  columnMetadata: ColumnMetadata[];
  errors: string[];
  delimiter: string;
  totalRows: number;
}

export function parseCsvText(rawText: string): ParseResult {
  const errors: string[] = [];
  if (!rawText || rawText.trim().length === 0) {
    return {
      data: [],
      columns: [],
      columnMetadata: [],
      errors: ['The input data is completely empty. Please provide CSV or TSV content.'],
      delimiter: ',',
      totalRows: 0,
    };
  }

  const parseResult = Papa.parse<Record<string, any>>(rawText.trim(), {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
  });

  if (parseResult.errors && parseResult.errors.length > 0) {
    for (const err of parseResult.errors.slice(0, 5)) {
      errors.push(`Row ${err.row ?? '?'}: ${err.message}`);
    }
  }

  const rawRows = parseResult.data as RawRow[];
  if (rawRows.length === 0) {
    return {
      data: [],
      columns: [],
      columnMetadata: [],
      errors: ['No data rows could be parsed from the provided input.'],
      delimiter: parseResult.meta.delimiter || ',',
      totalRows: 0,
    };
  }

  const columns = parseResult.meta.fields || Object.keys(rawRows[0] || {});
  if (columns.length < 2) {
    errors.push('Dataset must contain at least 2 columns (User ID and Item ID). Detected only ' + columns.length + ' column(s).');
  }

  // Detect metadata for each column
  const columnMetadata: ColumnMetadata[] = columns.map((colName) => {
    let nullCount = 0;
    const uniqueValues = new Set<string | number>();
    const sampleValues: (string | number)[] = [];
    let numberMatches = 0;
    let dateMatches = 0;
    let validCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const val = rawRows[i][colName];
      if (val === undefined || val === null || val === '') {
        nullCount++;
        continue;
      }

      validCount++;
      const strVal = String(val).trim();
      uniqueValues.add(strVal);

      if (sampleValues.length < 5 && !sampleValues.includes(strVal)) {
        sampleValues.push(strVal);
      }

      // Check numeric
      const numVal = Number(strVal);
      if (!isNaN(numVal) && isFinite(numVal) && strVal !== '') {
        numberMatches++;
      } else {
        // Check date
        const parsedDate = Date.parse(strVal);
        if (!isNaN(parsedDate) && (strVal.includes('-') || strVal.includes('/') || strVal.includes('T'))) {
          dateMatches++;
        }
      }
    }

    let detectedType: 'string' | 'number' | 'date' | 'boolean' = 'string';
    if (validCount > 0) {
      if (numberMatches / validCount > 0.85) {
        detectedType = 'number';
      } else if (dateMatches / validCount > 0.85) {
        detectedType = 'date';
      }
    }

    return {
      name: colName,
      sampleValues,
      detectedType,
      uniqueCount: uniqueValues.size,
      nullCount,
      totalCount: rawRows.length,
    };
  });

  return {
    data: rawRows,
    columns,
    columnMetadata,
    errors,
    delimiter: parseResult.meta.delimiter || ',',
    totalRows: rawRows.length,
  };
}

/**
 * Parses timestamp string or epoch number safely to Unix milliseconds
 */
export function parseTimestampSafely(val: string | number | undefined | null): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  
  // If it's already a number or numeric string
  const num = Number(val);
  if (!isNaN(num) && isFinite(num)) {
    // If it's in seconds (e.g. 1700000000), convert to ms
    if (num > 100000000 && num < 10000000000) {
      return num * 1000;
    }
    // If it's already ms (e.g. 1700000000000)
    if (num >= 10000000000) {
      return num;
    }
  }

  // If it's a date string (ISO 8601, RFC 2822, etc.)
  const parsed = Date.parse(String(val));
  if (!isNaN(parsed)) {
    return parsed;
  }

  return undefined;
}
