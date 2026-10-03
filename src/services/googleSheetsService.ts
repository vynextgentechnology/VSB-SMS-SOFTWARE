export interface GoogleDriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface GoogleSheetTab {
  sheetId: number;
  title: string;
  rowCount?: number;
  columnCount?: number;
}

export interface GoogleSpreadsheetInfo {
  id: string;
  title: string;
  sheets: GoogleSheetTab[];
}

/**
 * Extracts a Google Spreadsheet ID from a URL or raw ID string.
 * Supports standard URLs: https://docs.google.com/spreadsheets/d/{id}/edit...
 */
export function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  // Check if it's already an ID
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

/**
 * Lists user spreadsheets from Google Drive using Drive API v3.
 */
export async function listGoogleSpreadsheets(token: string): Promise<GoogleDriveFile[]> {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=30`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Failed to fetch Google Spreadsheets (${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name || 'Untitled Spreadsheet',
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink || `https://docs.google.com/spreadsheets/d/${f.id}/edit`,
  }));
}

/**
 * Fetches spreadsheet metadata including sheet tabs from Google Sheets API v4.
 */
export async function getSpreadsheetDetails(
  spreadsheetId: string,
  token: string
): Promise<GoogleSpreadsheetInfo> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const fields = encodeURIComponent('properties.title,sheets.properties(sheetId,title,gridProperties)');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=${fields}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Failed to get spreadsheet details (${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  const sheets: GoogleSheetTab[] = (data.sheets || []).map((s: any) => ({
    sheetId: s.properties?.sheetId || 0,
    title: s.properties?.title || 'Sheet1',
    rowCount: s.properties?.gridProperties?.rowCount,
    columnCount: s.properties?.gridProperties?.columnCount,
  }));

  return {
    id: cleanId,
    title: data.properties?.title || 'Spreadsheet',
    sheets,
  };
}

/**
 * Reads all rows from a specific sheet in Google Spreadsheet.
 */
export async function getSheetValues(
  spreadsheetId: string,
  sheetTitle: string,
  token: string
): Promise<any[][]> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const range = encodeURIComponent(sheetTitle || 'Sheet1');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${range}?valueRenderOption=FORMATTED_VALUE`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Failed to read values from sheet "${sheetTitle}" (${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  return data.values || [];
}

/**
 * Creates a brand new Google Spreadsheet in the user's Google Drive and populates it with rows.
 */
export async function createGoogleSpreadsheetWithData(
  title: string,
  sheetTitle: string,
  rows: (string | number)[][],
  token: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; title: string }> {
  // Step 1: Create Spreadsheet
  const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  const tabName = sheetTitle || 'Assessment Results';

  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: title,
      },
      sheets: [
        {
          properties: {
            title: tabName,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errorData = await createRes.json().catch(() => ({}));
    const message = errorData?.error?.message || `Failed to create Google Spreadsheet (${createRes.status})`;
    throw new Error(message);
  }

  const createdData = await createRes.json();
  const spreadsheetId = createdData.spreadsheetId;
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Step 2: Write values if rows provided
  if (rows && rows.length > 0) {
    const range = encodeURIComponent(`${tabName}!A1`);
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;

    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `${tabName}!A1`,
        majorDimension: 'ROWS',
        values: rows,
      }),
    });

    if (!updateRes.ok) {
      console.warn('Values update failed, spreadsheet created:', spreadsheetUrl);
    }
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    title,
  };
}
