#!/usr/bin/env node

/**
 * Test Complete Auto-Resolve Flow
 * Simulates the actual JWT authentication flow with auto-resolved contact ID
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

async function testAutoResolveFlow() {
  console.log('🔄 Testing Complete Auto-Resolve JWT Flow\n');

  // STEP 1: Resolve contact ID from Contact/get
  console.log('STEP 1: Resolve Contact ID (Auto-Resolve)');
  console.log('─'.repeat(50));
  let contactId;
  try {
    const res = await makeRequest('POST', '/civicrm/ajax/api4/Contact/get',
      { params: JSON.stringify({ select: ['id'], limit: 1 }) },
      true
    );
    
    if (res.status === 200 && res.data.values && res.data.values[0]) {
      contactId = res.data.values[0].id;
      console.log(`✅ Contact ID resolved: ${contactId}`);
      console.log(`   Name: ${res.data.values[0].display_name || '(no name)'}`);
    } else {
      throw new Error(`Failed to resolve contact (HTTP ${res.status})`);
    }
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
    process.exit(1);
  }

  console.log('\n');

  // STEP 2: Generate JWT using resolved contact ID
  console.log('STEP 2: Generate JWT with Auto-Resolved Contact ID');
  console.log('─'.repeat(50));
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
  console.log('─'.repeat(50));
  try {
    // Make request with JWT instead of API key
    const url = new URL('/civicrm/ajax/api4/Contact/get', BASE_URL);
    const headers = {
      'X-Civi-Auth': `Bearer ${jwtToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const bodyData = new URLSearchParams({
      params: JSON.stringify({ limit: 1 }),
    }).toString();

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: headers,
    };

    const response = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, data: data });
          }
        });
      });

      req.on('error', reject);
      req.write(bodyData);
      req.end();
    });

    if (response.status === 200 && response.data.values && response.data.values[0]) {
      console.log(`✅ API call successful with JWT!`);
      console.log(`   Contact ID: ${response.data.values[0].id}`);
      console.log(`   Name: ${response.data.values[0].display_name}`);
    } else {
      console.log(`Response data:`, JSON.stringify(response.data, null, 2));
      throw new Error(`API call failed (HTTP ${response.status})`);
    }
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
    process.exit(1);
  }

  console.log('\n');
  console.log('✨ AUTO-RESOLVE JWT FLOW SUCCESSFUL!');
  console.log('\n📋 Summary:');
  console.log('  1. User provides: baseUrl + apiToken (NO contactId needed)');
  console.log('  2. System auto-resolves: Contact/get → ID=' + contactId);
  console.log('  3. System generates: JWT for that contactId');
  console.log('  4. System uses: JWT for all subsequent API calls');
  console.log('  5. User benefits: Perfect UX, no manual contact ID lookup\n');
}

testAutoResolveFlow().catch(console.error);
