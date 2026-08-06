#!/usr/bin/env node

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

async function runTests() {
  console.log('🧪 Testing Auto-Resolve Approaches\n');

  // TEST 1: Get current authenticated contact
  console.log('TEST 1: Getting current authenticated contact via Contact/get');
  try {
    const res = await makeRequest('POST', '/civicrm/ajax/api4/Contact/get', 
      { params: JSON.stringify({ limit: 1 }) }, 
      true
    );
    console.log(`Status: ${res.status}`);
    console.log(`Response:`, JSON.stringify(res.data, null, 2));
    
    if (res.status === 200 && res.data && res.data.values && res.data.values[0]) {
      console.log(`✅ Found contact: ID=${res.data.values[0].id}, Name=${res.data.values[0].display_name}`);
    } else {
      console.log('❌ Could not retrieve current contact');
    }
  } catch (err) {
    console.log('❌ Error:', err.message);
  }

  console.log('\n---\n');

  // TEST 2: AuthxCredential/create WITHOUT contactId
  console.log('TEST 2: AuthxCredential/create WITHOUT contactId parameter');
  try {
    const res = await makeRequest('POST', '/civicrm/ajax/api4/AuthxCredential/create', 
      { params: JSON.stringify({}) }, 
      true
    );
    console.log(`Status: ${res.status}`);
    console.log(`Response:`, JSON.stringify(res.data, null, 2));
    
    if (res.status === 200 && res.data && res.data[0]) {
      console.log(`✅ JWT created without contactId! Token: ${res.data[0].credential}`);
    } else {
      console.log('❌ AuthxCredential/create requires contactId parameter');
    }
  } catch (err) {
    console.log('❌ Error:', err.message);
  }

  console.log('\n---\n');

  // TEST 3: AuthxCredential/create WITH contactId=null
  console.log('TEST 3: AuthxCredential/create WITH contactId=null');
  try {
    const res = await makeRequest('POST', '/civicrm/ajax/api4/AuthxCredential/create', 
      { params: JSON.stringify({ contactId: null }) }, 
      true
    );
    console.log(`Status: ${res.status}`);
    console.log(`Response:`, JSON.stringify(res.data, null, 2));
    
    if (res.status === 200 && res.data && res.data[0]) {
      console.log(`✅ JWT created with contactId=null!`);
    } else {
      console.log('❌ contactId=null not accepted');
    }
  } catch (err) {
    console.log('❌ Error:', err.message);
  }

  console.log('\n---\n');

  // TEST 4: AuthxCredential/create WITH contactId=1
  console.log('TEST 4: AuthxCredential/create WITH contactId=1 (for comparison)');
  try {
    const res = await makeRequest('POST', '/civicrm/ajax/api4/AuthxCredential/create', 
      { params: JSON.stringify({ contactId: 1 }) }, 
      true
    );
    console.log(`Status: ${res.status}`);
    if (res.status === 200 && res.data && res.data[0]) {
      console.log(`✅ JWT created successfully with contactId=1`);
      console.log(`Token (truncated): ${res.data[0].credential.substring(0, 50)}...`);
    } else {
      console.log(`Response:`, JSON.stringify(res.data, null, 2));
    }
  } catch (err) {
    console.log('❌ Error:', err.message);
  }
}

runTests().catch(console.error);
