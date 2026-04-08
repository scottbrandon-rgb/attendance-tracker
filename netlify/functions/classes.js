const BASE_ID = 'appXyrgiQoTHsXXuN';
const TABLE_ID = 'tbl7clgcD7T9uX7uV';
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

function successResponse(data) {
  return {
    statusCode: 200,
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

export const handler = async (event) => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed');
  }

  try {
    const params = new URLSearchParams({
      'fields[]': ['fldkdrTcPWNN4Ofqa', 'fldAaeOW95ADX5HBQ'],
      sort: JSON.stringify([{ field: 'fldkdrTcPWNN4Ofqa', direction: 'asc' }]),
    });

    // Airtable requires fields[] as repeated params
    const url = `${AIRTABLE_BASE_URL}?fields%5B%5D=fldkdrTcPWNN4Ofqa&fields%5B%5D=fldAaeOW95ADX5HBQ&sort%5B0%5D%5Bfield%5D=fldkdrTcPWNN4Ofqa&sort%5B0%5D%5Bdirection%5D=asc`;

    let allRecords = [];
    let offset = null;

    do {
      const pageUrl = offset ? `${url}&offset=${offset}` : url;
      const data = await airtableFetch(pageUrl);
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset || null;
    } while (offset);

    const classes = allRecords.map((record) => ({
      id: record.id,
      name: record.fields['fldkdrTcPWNN4Ofqa'] || '',
      description: record.fields['fldAaeOW95ADX5HBQ'] || '',
    }));

    return successResponse(classes);
  } catch (err) {
    console.error('classes.js GET error:', err);
    return errorResponse(500, err.message || 'Internal server error');
  }
};
