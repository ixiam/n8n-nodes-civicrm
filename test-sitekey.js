#!/usr/bin/env node

/**
 * Test script: API Key + Site Key authentication
 * 
 * Usage:
 *   node test-sitekey.js <baseUrl> <apiToken> <siteKey>
 * 
 * Example:
 *   node test-sitekey.js "https://crm.diabetescero.org" "KyoPZYVtQMjbfXzq" "dURHYzBHVTZOaDJhaENPWGNzbVZQdXdNRGlJblowUWdXZjZIUwo"
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

async function testApiKeyWithSiteKey(baseUrl, apiToken, siteKey) {
	console.log(`\n🔑 Test: API Key + Site Key Authentication`);
	console.log(`  Instance: ${baseUrl}`);
	console.log(`  API Token: ${apiToken.substring(0, 5)}...`);
	console.log(`  Site Key: ${siteKey.substring(0, 10)}...`);

	// Test 1: API Key only (baseline)
	console.log(`\n📝 Test 1: API Key only (baseline)...`);
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

		if (response.status === 200) {
			console.log(`   ✅ HTTP 200: API Key works`);
		} else {
			console.log(`   ❌ HTTP ${response.status}`);
			return false;
		}
	} catch (error) {
		console.error(`   ❌ Error: ${error.message}`);
		return false;
	}

	// Test 2: API Key + Site Key header
	console.log(`\n📝 Test 2: API Key + Site Key header...`);

	try {
		const response = await makeRequest(
			`${baseUrl}/civicrm/ajax/api4/Contact/get`,
			{
				method: 'POST',
				headers: {
					'X-Civi-Auth': `Bearer ${apiToken}`,
					'X-Civi-SiteKey': siteKey,
				},
				body,
			}
		);

		if (response.status === 200) {
			console.log(`   ✅ HTTP 200: API Key + Site Key works!`);
			console.log(`   📊 Response: ${response.data?.count} contacts returned`);
			return true;
		} else {
			console.log(`   ❌ HTTP ${response.status}`);
			console.log(`   Error: ${response.data?.error_message || response.data}`);
			return false;
		}
	} catch (error) {
		console.error(`   ❌ Error: ${error.message}`);
		return false;
	}
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 3) {
		console.log('Usage: node test-sitekey.js <baseUrl> <apiToken> <siteKey>');
		console.log('Example: node test-sitekey.js "https://crm.diabetescero.org" "KyoPZYVtQMjbfXzq" "dURHYzBHVTZOaDJhaENPWGNzbVZQdXdNRGlJblowUWdXZjZIUwo"');
		process.exit(1);
	}

	const [baseUrl, apiToken, siteKey] = args;

	try {
		const success = await testApiKeyWithSiteKey(baseUrl, apiToken, siteKey);

		if (success) {
			console.log('\n🎉 Success! API Key + Site Key authentication works.');
			process.exit(0);
		} else {
			console.log('\n❌ Failed.');
			process.exit(1);
		}
	} catch (error) {
		console.error(`\n❌ Test error: ${error.message}`);
		process.exit(1);
	}
}

main();
