#!/usr/bin/env node

/**
 * Test script for JWT authentication with Site Key
 * 
 * Usage:
 *   node test-jwt.js <baseUrl> <apiToken> <siteKey>
 * 
 * Example:
 *   node test-jwt.js "https://civicrm.en.demo.civi-go.net" "your-api-token" "your-site-key"
 */

const https = require('https');
const http = require('http');
const jwt = require('jsonwebtoken');
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

function generateJwt(baseUrl, siteKey) {
	console.log(`\n📝 Generating JWT with Site Key...`);
	const hostname = new URL(baseUrl).hostname;
	const token = jwt.sign(
		{
			sub: hostname,
			scope: 'authx',
			iat: Math.floor(Date.now() / 1000),
		},
		siteKey,
		{ expiresIn: 900, algorithm: 'HS256' }
	);
	console.log(`   ✅ JWT generated`);
	console.log(`   Token (first 50 chars): ${token.substring(0, 50)}...`);
	return token;
}

async function testWithApiKey(baseUrl, apiToken) {
	console.log(`\n🔑 Testing with API key (baseline)...`);

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

		console.log(`   ✅ API key authentication works`);
		console.log(`   Response:`, JSON.stringify(response.data, null, 2));
		return true;
	} catch (error) {
		console.error(`   ❌ Error:`, error.message);
		return false;
	}
}

async function testWithJwt(baseUrl, jwtToken, headerMode = 'both') {
	console.log(`\n🔐 Testing with JWT (${headerMode} mode)...`);

	const params = { select: ['id', 'display_name'], limit: 1 };
	const body = `params=${encodeURIComponent(JSON.stringify(params))}`;
	const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

	// Apply JWT to headers based on mode
	const bearer = `Bearer ${jwtToken}`;
	if (headerMode === 'both' || headerMode === 'authorization') {
		headers.Authorization = bearer;
	}
	if (headerMode === 'both' || headerMode === 'xheader') {
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
		console.log('Usage: node test-jwt.js <baseUrl> <apiToken> <siteKey>');
		console.log('Example: node test-jwt.js "https://civicrm.en.demo.civi-go.net" "api-token-here" "site-key-here"');
		process.exit(1);
	}

	const [baseUrl, apiToken, siteKey] = args;

	try {
		// Test 1: API key baseline
		const apiKeyWorks = await testWithApiKey(baseUrl, apiToken);
		if (!apiKeyWorks) {
			console.error('\n❌ API key authentication failed. Check your credentials.');
			process.exit(1);
		}

		// Test 2: Generate JWT with Site Key
		const jwtToken = generateJwt(baseUrl, siteKey);

		// Test 3: Try all three header modes
		const modes = ['both', 'authorization', 'xheader'];
		let jwtWorked = false;

		for (const mode of modes) {
			const worked = await testWithJwt(baseUrl, jwtToken, mode);
			if (worked) {
				jwtWorked = true;
				break;
			}
		}

		if (jwtWorked) {
			console.log('\n✅ All tests passed! JWT with Site Key is working correctly.');
			process.exit(0);
		} else {
			console.log('\n⚠️  API key works but JWT failed on all header modes.');
			console.log('   This may indicate that CiviCRM is not configured to accept Site Key signed JWTs.');
			process.exit(1);
		}
	} catch (error) {
		console.error('\n❌ Test failed:', error.message);
		process.exit(1);
	}
}

main();
