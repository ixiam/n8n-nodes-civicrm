#!/usr/bin/env node

/**
 * Test script for JWT from AuthxCredential/create
 * 
 * Usage:
 *   node test-authx-jwt.js <baseUrl> <apiToken> <contactId>
 * 
 * Example:
 *   node test-authx-jwt.js "https://crm.diabetescero.org" "KyoPZYVtQMjbfXzq" 119990
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

async function makeRequest(url, options = {}) {
	return new Promise((resolve, reject) => {
		const parsedUrl = new URL(url);
		const protocol = parsedUrl.protocol === 'https:' ? https : http;

		const requestOptions = {
			method: options.method || 'GET',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				...options.headers,
			},
		};

		const req = protocol.request(url, requestOptions, (res) => {
			let data = '';
			res.on('data', (chunk) => {
				data += chunk;
			});
			res.on('end', () => {
				try {
					const parsed = JSON.parse(data);
					resolve({ status: res.statusCode, data: parsed, headers: res.headers });
				} catch (e) {
					resolve({ status: res.statusCode, data, headers: res.headers });
				}
			});
		});

		req.on('error', reject);

		if (options.body) {
			req.write(options.body);
		}

		req.end();
	});
}

async function testWithApiKey(baseUrl, apiToken) {
	console.log(`\n🔑 Test 1: API key baseline...`);

	const params = { select: ['id', 'display_name'], limit: 1 };
	const body = `params=${encodeURIComponent(JSON.stringify(params))}`;

	try {
		const response = await makeRequest(
			`${baseUrl}/civicrm/ajax/api4/Contact/get`,
			{
				method: 'POST',
				headers: {
					'X-Civi-Auth': `Bearer ${apiToken}`,
				},
				body,
			}
		);

		console.log(`   Status: ${response.status}`);

		if (response.status !== 200) {
			console.error(`   ❌ Failed: HTTP ${response.status}`);
			console.error(`   Response:`, response.data);
			return false;
		}

		console.log(`   ✅ API key works`);
		return true;
	} catch (error) {
		console.error(`   ❌ Error:`, error.message);
		return false;
	}
}

async function getJwtFromAuthx(baseUrl, apiToken, contactId, ttl = 3600) {
	console.log(`\n🔐 Test 2: Request JWT from AuthxCredential/create...`);
	console.log(`   Contact ID: ${contactId}, TTL: ${ttl}s`);

	const params = {
		contactId: contactId,
		ttl: ttl,
	};

	const body = `params=${encodeURIComponent(JSON.stringify(params))}`;

	try {
		const response = await makeRequest(
			`${baseUrl}/civicrm/ajax/api4/AuthxCredential/create`,
			{
				method: 'POST',
				headers: {
					'X-Civi-Auth': `Bearer ${apiToken}`,
				},
				body,
			}
		);

		console.log(`   Status: ${response.status}`);

		if (response.status !== 200) {
			console.error(`   ❌ Failed: HTTP ${response.status}`);
			console.error(`   Response:`, response.data);
			throw new Error(`HTTP ${response.status}`);
		}

		const cred = response.data?.values?.[0]?.cred;
		if (!cred || !cred.startsWith('Bearer ')) {
			console.error(`   ❌ Invalid response format`);
			console.error(`   Response:`, response.data);
			throw new Error('Missing or invalid Bearer token');
		}

		const token = cred.substring(7);
		console.log(`   ✅ JWT obtained`);
		console.log(`   Token (first 50 chars): ${token.substring(0, 50)}...`);
		return token;
	} catch (error) {
		console.error(`   ❌ Error:`, error.message);
		throw error;
	}
}

async function testWithJwt(baseUrl, jwtToken, mode = 'xheader') {
	console.log(`\n✅ Test 3: Use JWT for API call (${mode} mode)...`);

	const params = { select: ['id', 'display_name'], limit: 1 };
	const body = `params=${encodeURIComponent(JSON.stringify(params))}`;
	const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

	// Apply JWT based on mode
	const bearer = `Bearer ${jwtToken}`;
	if (mode === 'both' || mode === 'authorization') {
		headers.Authorization = bearer;
	}
	if (mode === 'both' || mode === 'xheader') {
		headers['X-Civi-Auth'] = bearer;
	}

	try {
		const response = await makeRequest(
			`${baseUrl}/civicrm/ajax/api4/Contact/get`,
			{
				method: 'POST',
				headers,
				body,
			}
		);

		console.log(`   Status: ${response.status}`);

		if (response.status !== 200) {
			console.error(`   ❌ Failed: HTTP ${response.status}`);
			console.error(`   Response:`, response.data);
			return false;
		}

		console.log(`   ✅ JWT authentication works`);
		console.log(`   Response count: ${response.data?.count}`);
		return true;
	} catch (error) {
		console.error(`   ❌ Error:`, error.message);
		return false;
	}
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 3) {
		console.log('Usage: node test-authx-jwt.js <baseUrl> <apiToken> <contactId>');
		console.log('Example: node test-authx-jwt.js "https://crm.diabetescero.org" "KyoPZYVtQMjbfXzq" 119990');
		process.exit(1);
	}

	const [baseUrl, apiToken, contactId] = args;

	try {
		// Test 1: API key baseline
		const apiKeyWorks = await testWithApiKey(baseUrl, apiToken);
		if (!apiKeyWorks) {
			console.error('\n❌ API key failed. Check credentials.');
			process.exit(1);
		}

		// Test 2: Get JWT from AuthxCredential/create
		const jwtToken = await getJwtFromAuthx(baseUrl, apiToken, parseInt(contactId), 3600);

		// Test 3: Use JWT for API call
		const jwtWorks = await testWithJwt(baseUrl, jwtToken, 'xheader');

		if (jwtWorks) {
			console.log('\n🎉 All tests passed! AuthxCredential/create JWT flow works.');
			process.exit(0);
		} else {
			console.log('\n⚠️  JWT obtained but API call failed.');
			process.exit(1);
		}
	} catch (error) {
		console.error('\n❌ Test failed:', error.message);
		process.exit(1);
	}
}

main();
