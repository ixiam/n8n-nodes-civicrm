#!/usr/bin/env node

/**
 * Test JWT with all header modes
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

async function getJwt(baseUrl, apiToken, contactId, ttl = 3600) {
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

		if (response.status !== 200) {
			throw new Error(`HTTP ${response.status}`);
		}

		const cred = response.data?.values?.[0]?.cred || '';
		if (!cred.startsWith('Bearer ')) {
			throw new Error('Missing Bearer token');
		}

		return cred.substring(7);
	} catch (error) {
		throw new Error(`Failed to get JWT: ${error.message}`);
	}
}

async function testWithJwt(baseUrl, jwtToken, mode = 'xheader') {
	const params = { select: ['id', 'display_name'], limit: 1 };
	const body = `params=${encodeURIComponent(JSON.stringify(params))}`;
	const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

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

		return {
			status: response.status,
			success: response.status === 200,
			message: response.status === 200 ? 'OK' : response.data?.error_message || response.data,
		};
	} catch (error) {
		return { status: 0, success: false, message: error.message };
	}
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 3) {
		console.log('Usage: node test-jwt-modes.js <baseUrl> <apiToken> <contactId>');
		console.log('Example: node test-jwt-modes.js "https://crm.diabetescero.org" "KyoPZYVtQMjbfXzq" 55601');
		process.exit(1);
	}

	const [baseUrl, apiToken, contactId] = args;

	try {
		console.log(`\n🔐 Obtaining JWT...`);
		const jwt = await getJwt(baseUrl, apiToken, parseInt(contactId));
		console.log(`   ✅ JWT obtained (first 50 chars): ${jwt.substring(0, 50)}...`);

		console.log(`\n📝 Testing all header modes...`);

		const modes = ['xheader', 'authorization', 'both'];
		const results = [];

		for (const mode of modes) {
			const result = await testWithJwt(baseUrl, jwt, mode);
			results.push({ mode, ...result });
			const icon = result.success ? '✅' : '❌';
			console.log(`   ${icon} ${mode.padEnd(15)} HTTP ${result.status.toString().padEnd(3)} ${result.message}`);
		}

		const working = results.filter((r) => r.success);
		if (working.length > 0) {
			console.log(`\n🎉 Success! Working modes: ${working.map((r) => r.mode).join(', ')}`);
			process.exit(0);
		} else {
			console.log(`\n❌ No header modes worked`);
			process.exit(1);
		}
	} catch (error) {
		console.error(`\n❌ Error: ${error.message}`);
		process.exit(1);
	}
}

main();
