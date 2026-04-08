const BASE_ID = 'appXyrgiQoTHsXXuN';
const TABLE_ID = 'tblOBnaxjFesCv8dA';
const AIRTABLE_BASE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

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
  const classField = record.fields['fldqSvBdeXs6VL4jy'];
  return {
    id: record.id,
    name: record.fields['fld32Yk8Z3uFeVZSt'] || '',
    notes: record.fields['fldLEHYmhHlWr5HXJ'] || '',
    classId: Array.isArray(classField) && classField.length > 0 ? classField[0] : null,
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

export const handler = async (event) => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const params = event.queryStringParameters || {};

  // GET
  if (event.httpMethod === 'GET') {
    try {
      let url = `${AIRTABLE_BASE_URL}?fields%5B%5D=fld32Yk8Z3uFeVZSt&fields%5B%5D=fldLEHYmhHlWr5HXJ&fields%5B%5D=fldqSvBdeXs6VL4jy&sort%5B0%5D%5Bfield%5D=fld32Yk8Z3uFeVZSt&sort%5B0%5D%5Bdirection%5D=asc`;

      if (params.classId) {
        const formula = encodeURIComponent(`SEARCH("${params.classId}",ARRAYJOIN({fldqSvBdeXs6VL4jy}))`);
        url += `&filterByFormula=${formula}`;
      }

      const records = await getAllRecords(url);
      return successResponse(records.map(mapRecord));
    } catch (err) {
      console.error('members.js GET error:', err);
      return errorResponse(500, err.message || 'Internal server error');
    }
  }

  // POST — create member
  if (event.httpMethod === 'POST') {
    try {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return errorResponse(400, 'Invalid JSON body');
      }

      const { name, classId, notes } = body;
      if (!name || !classId) {
        return errorResponse(400, 'name and classId are required');
      }

      const fields = {
        fld32Yk8Z3uFeVZSt: name,
        fldqSvBdeXs6VL4jy: [classId],
      };
      if (notes) {
        fields['fldLEHYmhHlWr5HXJ'] = notes;
      }

      const data = await airtableFetch(AIRTABLE_BASE_URL, {
        method: 'POST',
        body: JSON.stringify({ fields }),
      });

      return successResponse(mapRecord(data), 201);
    } catch (err) {
      console.error('members.js POST error:', err);
      return errorResponse(500, err.message || 'Internal server error');
    }
  }

  // PATCH — update member
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

      const fields = {};
      if (body.name !== undefined) fields['fld32Yk8Z3uFeVZSt'] = body.name;
      if (body.notes !== undefined) fields['fldLEHYmhHlWr5HXJ'] = body.notes;
      if (body.classId !== undefined) fields['fldqSvBdeXs6VL4jy'] = [body.classId];

      const data = await airtableFetch(`${AIRTABLE_BASE_URL}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields }),
      });

      return successResponse(mapRecord(data));
    } catch (err) {
      console.error('members.js PATCH error:', err);
      return errorResponse(500, err.message || 'Internal server error');
    }
  }

  // DELETE — delete member
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
      console.error('members.js DELETE error:', err);
      // If record is already gone, treat as success
      if (err.message && err.message.includes('NOT_FOUND')) {
        return successResponse({ deleted: true, id: params.id });
      }
      return errorResponse(500, err.message || 'Internal server error');
    }
  }

  return errorResponse(405, 'Method not allowed');
};
