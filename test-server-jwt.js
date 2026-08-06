#!/usr/bin/env node

/**
 * Test script for server-issued JWT authentication
 * 
 * Usage:
 *   node test-server-jwt.js <baseUrl> <apiToken> <contactId> [ttl]
 * 
 * Example:
 *   node test-server-jwt.js "https://civicrm.en.demo.civi-go.net" "your-api-token" 2 3600
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

async function getServerIssuedJwt(baseUrl, apiToken, contactId, ttl = 3600) {
	console.log(`\n📋 Requesting JWT from AuthxCredential/create...`);
	console.log(`   Base URL: ${baseUrl}`);
	console.log(`   Contact ID: ${contactId}`);
	console.log(`   TTL: ${ttl}s`);

	const params = {
		contactId: contactId,
		ttl: ttl,
	};

	const body = `params=${encodeURIComponent(JSON.stringify(params))}`;

	try {
		const response = await makeRequest(
			`${baseUrl}/civicrm/api/4/AuthxCredential/create`,
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
			throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
		}

		const cred = response.data?.values?.[0]?.cred;
		if (!cred || !cred.startsWith('Bearer ')) {
			console.error(`   ❌ Invalid response format`);
			console.error(`   Response:`, response.data);
			throw new Error('Missing or invalid Bearer token in response');
		}

		const token = cred.substring(7);
		console.log(`   ✅ JWT obtained successfully`);
		console.log(`   Token (first 50 chars): ${token.substring(0, 50)}...`);
		return token;
	} catch (error) {
		console.error(`   ❌ Error:`, error.message);
		throw error;
	}
}

async function testContactApiWithJwt(baseUrl, jwtToken) {
	console.log(`\n🔐 Testing Contact/get with JWT...`);

	const params = { select: ['id', 'display_name'], limit: 1 };
	const body = `params=${encodeURIComponent(JSON.stringify(params))}`;

	try {
		const response = await makeRequest(
			`${baseUrl}/civicrm/api/4/Contact/get`,
			{
				method: 'POST',
				headers: {
					'X-Civi-Auth': `Bearer ${jwtToken}`,
				},
				body,
			}
		);

		console.log(`   Status: ${response.status}`);

		if (response.status !== 200) {
			console.error(`   ❌ Failed: HTTP ${response.status}`);
			console.error(`   Response:`, response.data);
			throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
		}

		console.log(`   ✅ API call successful`);
		console.log(`   Response:`, JSON.stringify(response.data, null, 2));
		return response.data;
	} catch (error) {
		console.error(`   ❌ Error:`, error.message);
		throw error;
	}
}

async function testWithApiKey(baseUrl, apiToken) {
	console.log(`\n🔑 Testing with API key (baseline)...`);

	const params = { select: ['id', 'display_name'], limit: 1 };
	const body = `params=${encodeURIComponent(JSON.stringify(params))}`;

	try {
		const response = await makeRequest(
			`${baseUrl}/civicrm/api/4/Contact/get`,
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

		console.log(`   ✅ API key authentication works`);
		console.log(`   Response:`, JSON.stringify(response.data, null, 2));
		return true;
	} catch (error) {
		console.error(`   ❌ Error:`, error.message);
		return false;
	}
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 3) {
		console.log('Usage: node test-server-jwt.js <baseUrl> <apiToken> <contactId> [ttl]');
		console.log('Example: node test-server-jwt.js "https://civicrm.en.demo.civi-go.net" "api-token-here" 2 3600');
		process.exit(1);
	}

	const [baseUrl, apiToken, contactId, ttl] = args;

	try {
		// Test 1: API key baseline
		const apiKeyWorks = await testWithApiKey(baseUrl, apiToken);
		if (!apiKeyWorks) {
			console.error('\n❌ API key authentication failed. Check your credentials.');
			process.exit(1);
		}

		// Test 2: Get server-issued JWT
		const jwtToken = await getServerIssuedJwt(baseUrl, apiToken, parseInt(contactId), parseInt(ttl) || 3600);

		// Test 3: Use JWT for API call
		await testContactApiWithJwt(baseUrl, jwtToken);

		console.log('\n✅ All tests passed! Server-issued JWT is working correctly.');
		process.exit(0);
	} catch (error) {
		console.error('\n❌ Test failed:', error.message);
		process.exit(1);
	}
}

main();
