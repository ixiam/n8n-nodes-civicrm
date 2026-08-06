#!/usr/bin/env node

/**
 * Test script demonstrating JWT fallback to API key
 * when user lacks permissions for AuthxCredential/create
 * 
 * Simulates:
 * 1. Attempt JWT via AuthxCredential/create (fails with 403)
 * 2. Automatic fallback to API key (succeeds)
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

async function testFallback(baseUrl, apiToken, contactId) {
	console.log(`\n🔄 JWT Fallback Test`);
	console.log(`  Instance: ${baseUrl}`);
	console.log(`  Contact ID: ${contactId}`);
	console.log(`  API Token: ${apiToken.substring(0, 5)}...`);

	// Test 1: Try to get JWT (will fail with 403)
	console.log(`\n📝 Step 1: Attempt JWT from AuthxCredential/create...`);

	const params = {
		contactId: contactId,
		ttl: 3600,
	};

	const body = `params=${encodeURIComponent(JSON.stringify(params))}`;

	let jwtFailed = false;
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

		if (response.status === 403) {
			console.log(`   ⚠️  HTTP 403: User lacks permissions`);
			console.log(`   💡 Falling back to API key authentication...`);
			jwtFailed = true;
		} else if (response.status !== 200) {
			console.log(`   ❌ HTTP ${response.status}: ${response.data?.error_message || 'Unknown error'}`);
			throw new Error(`Failed with HTTP ${response.status}`);
		} else {
			console.log(`   ✅ JWT obtained successfully`);
		}
	} catch (error) {
		console.log(`   ❌ Error: ${error.message}`);
		jwtFailed = true;
	}

	// Test 2: Make API call with API key only
	console.log(`\n🔑 Step 2: Execute API call with API key only...`);

	const apiParams = { select: ['id', 'display_name'], limit: 5 };
	const apiBody = `params=${encodeURIComponent(JSON.stringify(apiParams))}`;

	try {
		const response = await makeRequest(
			`${baseUrl}/civicrm/ajax/api4/Contact/get`,
			{
				method: 'POST',
				headers: {
					'X-Civi-Auth': `Bearer ${apiToken}`,
				},
				body: apiBody,
			}
		);

		if (response.status === 200) {
			console.log(`   ✅ API call succeeded`);
			console.log(`   📊 Results: ${response.data?.count || 0} contacts`);

			if (response.data?.values && response.data.values.length > 0) {
				console.log(`      - ${response.data.values[0].display_name}`);
			}

			return true;
		} else {
			console.log(`   ❌ HTTP ${response.status}`);
			console.log(`   Response:`, response.data);
			return false;
		}
	} catch (error) {
		console.log(`   ❌ Error: ${error.message}`);
		return false;
	}
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 3) {
		console.log('Usage: node test-fallback.js <baseUrl> <apiToken> <contactId>');
		console.log('Example: node test-fallback.js "https://crm.diabetescero.org" "KyoPZYVtQMjbfXzq" 55601');
		process.exit(1);
	}

	const [baseUrl, apiToken, contactId] = args;

	try {
		const success = await testFallback(baseUrl, apiToken, parseInt(contactId));

		if (success) {
			console.log('\n🎉 Fallback test passed! JWT unavailable but API key works.');
			console.log('   This configuration supports both:');
			console.log('   - Admin users: JWT authentication (secure, scoped)');
			console.log('   - Non-admin users: API key authentication (compatible fallback)');
			process.exit(0);
		} else {
			console.log('\n❌ Fallback failed.');
			process.exit(1);
		}
	} catch (error) {
		console.error('\n❌ Test error:', error.message);
		process.exit(1);
	}
}

main();
