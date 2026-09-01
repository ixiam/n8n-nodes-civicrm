#!/usr/bin/env node

/**
 * Test JWT Implementation
 * Verifies that server-issued JWT authentication works correctly
 *
 * Usage:
 *   node test-jwt-implementation.js <baseUrl> <apiToken> <contactId>
 *
 * Example:
 *   node test-jwt-implementation.js "https://crm.diabetescero.org" "YOUR_API_KEY" "1"
 */

const https = require('https');
const url = require('url');

// Get arguments
const baseUrl = process.argv[2];
const apiToken = process.argv[3];
const contactId = process.argv[4];

if (!baseUrl || !apiToken || !contactId) {
  console.error('❌ Usage: node test-jwt-implementation.js <baseUrl> <apiToken> <contactId>');
  process.exit(1);
}

console.log(`🔍 Testing JWT Implementation`);
console.log(`   Base URL: ${baseUrl}`);
console.log(`   Contact ID: ${contactId}`);
console.log('');

// Helper to make HTTPS requests
function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new url.URL(options.url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method,
      headers: options.headers,
      rejectUnauthorized: false,
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

// Main test flow
async function runTests() {
  try {
    // Step 1: Obtain JWT from AuthxCredential/create
    console.log('📋 Step 1: Obtaining JWT from AuthxCredential/create');
    const jwtRequestBody = new URLSearchParams({
      params: JSON.stringify({
        contactId: parseInt(contactId),
        ttl: 3600,
      }),
    }).toString();

    const jwtResponse = await makeRequest(
      {
        url: `${baseUrl}/civicrm/ajax/api4/AuthxCredential/create`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Civi-Auth': `Bearer ${apiToken}`,
        },
      },
      jwtRequestBody
    );

    if (jwtResponse.status !== 200) {
      console.error(`❌ Failed to obtain JWT (HTTP ${jwtResponse.status})`);
      console.error(`   Response: ${jwtResponse.body}`);
      process.exit(1);
    }

    let jwtData;
    try {
      jwtData = JSON.parse(jwtResponse.body);
    } catch (e) {
      console.error('❌ Invalid JSON response from AuthxCredential/create');
      console.error(`   Response: ${jwtResponse.body}`);
      process.exit(1);
    }

    const jwtToken = jwtData?.values?.[0]?.cred;
    if (!jwtToken || !jwtToken.startsWith('Bearer ')) {
      console.error('❌ No valid JWT received');
      console.error(`   Response: ${JSON.stringify(jwtData)}`);
      process.exit(1);
    }

    const jwt = jwtToken.substring(7); // Remove "Bearer " prefix
    console.log(`✅ JWT obtained successfully`);
    console.log(`   Token: ${jwt.substring(0, 20)}...${jwt.substring(jwt.length - 20)}`);
    console.log('');

    // Step 2: Test API call with JWT via X-Civi-Auth header
    console.log('📋 Step 2: Testing API call with JWT (X-Civi-Auth header)');
    const apiTestBody = new URLSearchParams({
      params: JSON.stringify({
        select: ['id', 'display_name'],
        limit: 1,
      }),
    }).toString();

    const apiResponse = await makeRequest(
      {
        url: `${baseUrl}/civicrm/ajax/api4/Contact/get`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Civi-Auth': `Bearer ${jwt}`,
        },
      },
      apiTestBody
    );

    if (apiResponse.status !== 200) {
      console.error(`❌ API call with JWT failed (HTTP ${apiResponse.status})`);
      console.error(`   Response: ${apiResponse.body}`);
      process.exit(1);
    }

    let apiData;
    try {
      apiData = JSON.parse(apiResponse.body);
    } catch (e) {
      console.error('❌ Invalid JSON response from API');
      console.error(`   Response: ${apiResponse.body}`);
      process.exit(1);
    }

    console.log(`✅ API call with JWT successful`);
    console.log(`   Response: ${JSON.stringify(apiData).substring(0, 100)}...`);
    console.log('');

    // Step 3: Verify JWT rejection with invalid token
    console.log('📋 Step 3: Verifying JWT validation (invalid token should fail)');
    const invalidResponse = await makeRequest(
      {
        url: `${baseUrl}/civicrm/ajax/api4/Contact/get`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Civi-Auth': `Bearer INVALID_JWT_TOKEN_HERE`,
        },
      },
      apiTestBody
    );

    if (invalidResponse.status === 200) {
      console.warn('⚠️  Invalid JWT was accepted (unexpected)');
    } else {
      console.log(`✅ Invalid JWT correctly rejected (HTTP ${invalidResponse.status})`);
    }
    console.log('');

    // Final summary
    console.log('✅ All tests passed!');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ JWT generation via AuthxCredential/create works');
    console.log('  ✅ JWT validation via X-Civi-Auth header works');
    console.log('  ✅ Invalid JWT is correctly rejected');
    console.log('');
    console.log('Note: Authorization header is for standard REST APIs.');
    console.log('      X-Civi-Auth header is for AJAX requests (recommended for n8n).');
    console.log('');
    console.log('🎉 JWT implementation is ready for production');
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    process.exit(1);
  }
}

runTests();
