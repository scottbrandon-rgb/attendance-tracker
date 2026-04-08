const BASE_ID = 'appXyrgiQoTHsXXuN';
const TABLE_ID = 'tblwpiIIknMl4OBn5';
const MEMBERS_TABLE_ID = 'tblOBnaxjFesCv8dA';
const AIRTABLE_BASE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
const MEMBERS_BASE_URL = `https://api.airtable.com/v0/${BASE_ID}/${MEMBERS_TABLE_ID}`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

function errorResponse(statusCode, message) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: message }),
  };
}

function successResponse(data, statusCode = 200) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data),
  };
}

async function airtableFetch(url, options = {}) {
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) {
    throw new Error('AIRTABLE_PAT environment variable is not set');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || `Airtable API error: ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function mapRecord(record) {
  const memberField = record.fields['fldhRq7Uuie0tqj2x'];
  const classField = record.fields['fldI1WQDhFZ4AAZFM'];
  return {
    id: record.id,
    memberId: Array.isArray(memberField) && memberField.length > 0 ? memberField[0] : null,
    classId: Array.isArray(classField) && classField.length > 0 ? classField[0] : null,
    date: record.fields['fldSGgN2v2vWaYgeS'] || '',
    status: record.fields['fldsJsZjzUZ64Yr9g'] || '',
  };
}

async function getAllRecords(url) {
  let allRecords = [];
  let offset = null;

  do {
    const pageUrl = offset ? `${url}&offset=${encodeURIComponent(offset)}` : url;
    const data = await airtableFetch(pageUrl);
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);

  return allRecords;
}

async function getMemberName(memberId) {
  try {
    const data = await airtableFetch(`${MEMBERS_BASE_URL}/${memberId}?fields%5B%5D=fld32Yk8Z3uFeVZSt`);
    return data.fields['fld32Yk8Z3uFeVZSt'] || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

export const handler = async (event) => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const params = event.queryStringParameters || {};

  // GET
  if (event.httpMethod === 'GET') {
    try {
      const { classId, date } = params;
      if (!classId) {
        return errorResponse(400, 'classId query parameter is required');
      }

      let formula;
      if (date) {
        // Filter by class AND date
        formula = encodeURIComponent(
          `AND(SEARCH("${classId}",ARRAYJOIN({fldI1WQDhFZ4AAZFM})),{fldSGgN2v2vWaYgeS}="${date}")`
        );
      } else {
        // Filter by class only (for history view)
        formula = encodeURIComponent(
          `SEARCH("${classId}",ARRAYJOIN({fldI1WQDhFZ4AAZFM}))`
        );
      }

      const url = `${AIRTABLE_BASE_URL}?fields%5B%5D=fldYippvtW53tKjVw&fields%5B%5D=fldSGgN2v2vWaYgeS&fields%5B%5D=fldsJsZjzUZ64Yr9g&fields%5B%5D=fldhRq7Uuie0tqj2x&fields%5B%5D=fldI1WQDhFZ4AAZFM&filterByFormula=${formula}&sort%5B0%5D%5Bfield%5D=fldSGgN2v2vWaYgeS&sort%5B0%5D%5Bdirection%5D=desc`;

      const records = await getAllRecords(url);
      return successResponse(records.map(mapRecord));
    } catch (err) {
      console.error('attendance.js GET error:', err);
      return errorResponse(500, err.message || 'Internal server error');
    }
  }

  // POST — create attendance record
  if (event.httpMethod === 'POST') {
    try {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return errorResponse(400, 'Invalid JSON body');
      }

      const { memberId, classId, date, status } = body;
      if (!memberId || !classId || !date || !status) {
        return errorResponse(400, 'memberId, classId, date, and status are required');
      }

      // Get member name for the Record label
      const memberName = await getMemberName(memberId);
      const recordLabel = `${memberName} - ${date}`;

      const fields = {
        fldYippvtW53tKjVw: recordLabel,
        fldSGgN2v2vWaYgeS: date,
        fldsJsZjzUZ64Yr9g: status,
        fldhRq7Uuie0tqj2x: [memberId],
        fldI1WQDhFZ4AAZFM: [classId],
      };

      const data = await airtableFetch(AIRTABLE_BASE_URL, {
        method: 'POST',
        body: JSON.stringify({ fields }),
      });

      return successResponse(mapRecord(data), 201);
    } catch (err) {
      console.error('attendance.js POST error:', err);
      return errorResponse(500, err.message || 'Internal server error');
    }
  }

  // PATCH — update status on existing record
  if (event.httpMethod === 'PATCH') {
    try {
      const id = params.id;
      if (!id) {
        return errorResponse(400, 'id query parameter is required');
      }

      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return errorResponse(400, 'Invalid JSON body');
      }

      const { status } = body;
      if (!status) {
        return errorResponse(400, 'status is required');
      }

      const fields = {
        fldsJsZjzUZ64Yr9g: status,
      };

      const data = await airtableFetch(`${AIRTABLE_BASE_URL}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields }),
      });

      return successResponse(mapRecord(data));
    } catch (err) {
      console.error('attendance.js PATCH error:', err);
      return errorResponse(500, err.message || 'Internal server error');
    }
  }

  // DELETE — delete attendance record
  if (event.httpMethod === 'DELETE') {
    try {
      const id = params.id;
      if (!id) {
        return errorResponse(400, 'id query parameter is required');
      }

      await airtableFetch(`${AIRTABLE_BASE_URL}/${id}`, {
        method: 'DELETE',
      });

      return successResponse({ deleted: true, id });
    } catch (err) {
      console.error('attendance.js DELETE error:', err);
      // If record is already gone, treat as success
      if (err.message && err.message.includes('NOT_FOUND')) {
        return successResponse({ deleted: true, id: params.id });
      }
      return errorResponse(500, err.message || 'Internal server error');
    }
  }

  return errorResponse(405, 'Method not allowed');
};
