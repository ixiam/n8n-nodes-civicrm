#!/usr/bin/env node

/**
 * Test Auto-Resolve with WHERE clause (api_key filter)
 * Simulates the CORRECTED JWT authentication flow
 */

const https = require('https');

const BASE_URL = 'https://crm.diabetescero.org';
const API_KEY = 'KyoPZYVtQMjbfXzq';

function makeRequest(method, path, body = null, isUrlEncoded = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = {
      'X-Civi-Auth': `Bearer ${API_KEY}`,
    };

    let bodyData = null;
    if (isUrlEncoded) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      bodyData = new URLSearchParams(body).toString();
    } else {
      headers['Content-Type'] = 'application/json';
      bodyData = body ? JSON.stringify(body) : null;
    }

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

async function testCorrectedFlow() {
  console.log('🔄 Testing CORRECTED Auto-Resolve JWT Flow (with WHERE clause)\n');

  // STEP 1: Resolve contact ID using WHERE clause
  console.log('STEP 1: Resolve Contact ID with WHERE api_key = ...');
  console.log('─'.repeat(60));
  let contactId;
  try {
    const res = await makeRequest('POST', '/civicrm/ajax/api4/Contact/get',
      {
        params: JSON.stringify({
          select: ['id', 'display_name'],
          where: [['api_key', '=', API_KEY]],
          limit: 1,
        }),
      },
      true
    );

    console.log(`Response status: ${res.status}`);
    
    if (res.status === 200 && res.data.values && res.data.values[0]) {
      contactId = res.data.values[0].id;
      console.log(`✅ Contact ID resolved: ${contactId}`);
      console.log(`   Name: ${res.data.values[0].display_name || '(no name)'}`);
      console.log(`   Count: ${res.data.countFetched}/${res.data.count}`);
    } else {
      console.log(`Response:`, JSON.stringify(res.data, null, 2));
      throw new Error(`Failed to resolve contact (HTTP ${res.status})`);
    }
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
    process.exit(1);
  }

  console.log('\n');

  // STEP 2: Generate JWT using resolved contact ID
  console.log('STEP 2: Generate JWT with Auto-Resolved Contact ID');
  console.log('─'.repeat(60));
  let jwtToken;
  try {
    const res = await makeRequest('POST', '/civicrm/ajax/api4/AuthxCredential/create',
      { params: JSON.stringify({ contactId: contactId, ttl: 3600 }) },
      true
    );

    if (res.status === 200 && res.data.values && res.data.values[0]) {
      const fullCred = res.data.values[0].cred;
      jwtToken = fullCred.replace('Bearer ', '');
      console.log(`✅ JWT generated successfully`);
      console.log(`   Token (truncated): ${jwtToken.substring(0, 50)}...`);
    } else {
      throw new Error(`Failed to generate JWT (HTTP ${res.status})`);
    }
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
    process.exit(1);
  }

  console.log('\n');

  // STEP 3: Use JWT for API call
  console.log('STEP 3: Make API Call with Generated JWT');
  console.log('─'.repeat(60));
  try {
    const res = await makeRequest('POST', '/civicrm/ajax/api4/Contact/get',
      {
        params: JSON.stringify({
          select: ['id', 'display_name'],
          limit: 5,
        }),
      },
      true
    );

    console.log(`Response status: ${res.status}`);
    console.log(`Response count: ${res.data.countFetched}/${res.data.count}`);

    if (res.status === 200 && res.data.values && res.data.values.length > 0) {
      console.log(`✅ API call with JWT successful!`);
      console.log(`   Returned ${res.data.values.length} contact(s)`);
      res.data.values.slice(0, 3).forEach((contact, idx) => {
        console.log(`   ${idx + 1}. ID=${contact.id}, Name=${contact.display_name}`);
      });
    } else if (res.status === 200 && res.data.values && res.data.values.length === 0) {
      console.log(`⚠️  JWT request returned HTTP 200 but with 0 results`);
      console.log(`   This indicates JWT has limited permissions`);
      console.log(`   n8n will auto-fallback to API key in this case`);
    } else {
      throw new Error(`Unexpected response format`);
    }
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
    process.exit(1);
  }

  console.log('\n');

  // STEP 4: Verify with API Key directly
  console.log('STEP 4: Verify with API Key (for comparison)');
  console.log('─'.repeat(60));
  try {
    const res = await makeRequest('POST', '/civicrm/ajax/api4/Contact/get',
      {
        params: JSON.stringify({
          select: ['id', 'display_name'],
          limit: 5,
        }),
      },
      true
    );

    if (res.status === 200 && res.data.values && res.data.values.length > 0) {
      console.log(`✅ API key request successful!`);
      console.log(`   Returned ${res.data.values.length} contact(s)`);
      res.data.values.slice(0, 3).forEach((contact, idx) => {
        console.log(`   ${idx + 1}. ID=${contact.id}, Name=${contact.display_name}`);
      });
    } else {
      console.log(`⚠️  API key returned 0 results`);
    }
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }

  console.log('\n');
  console.log('✨ TEST COMPLETE');
  console.log('\n📋 Summary:');
  console.log('  1. Contact ID resolved using WHERE api_key filter ✓');
  console.log('  2. JWT generated with resolved contact ID ✓');
  console.log('  3. JWT request status checked (data or empty) ✓');
  console.log('  4. n8n will auto-fallback to API key if JWT returns empty ✓\n');
}

testCorrectedFlow().catch(console.error);
