
const https = require('https');

const config = {
    url: 'https://smaster.demo.civicrm.org',
    apiKey: 'Q{12XT/su[+W'
};

const requestBody = JSON.stringify({
    version: 4,
    select: ['id'],
    limit: 1
});

const options = {
    hostname: 'smaster.demo.civicrm.org',
    path: '/civicrm/ajax/api4/Contact/get',
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded', // Based on CiviCrmApi.credentials.ts? No, wait.
        // In CiviCrmApi.credentials.ts, we see:
        // headers: { Authorization: ... }
        // BUT GenericFunctions.ts says: 'Content-Type': 'application/x-www-form-urlencoded' 
        // AND body: { params: JSON.stringify(body) }

        // HOWEVER, the `test` property in CiviCrmApi.credentials.ts does NOT go through GenericFunctions.
        // It's a standard n8n credential test request.
        // It defines:
        // request: { ... method: 'POST', body: { ... } }
        // n8n by default sends JSON if body is an object? Or form-urlencoded?
        // Let's check CiviCrmApi.credentials.ts again.
    }
};

// Re-checking the credential definition:
/*
    authenticate = {
        type: 'generic' as const,
        properties: {
            headers: {
                Authorization: 'Bearer ={{$credentials.apiKey}}',
            },
        },
    };
    test: ICredentialTestRequest = {
        request: {
            ...
            body: {
                version: 4,
                select: ['id'],
                limit: 1,
            },
*/
// It does NOT specify a Content-Type in the `test` request. N8n defaults to JSON for object bodies usually.
// BUT GenericFunctions.ts explicitly sets 'Content-Type': 'application/x-www-form-urlencoded'.
// Maybe the test request fails because it sends JSON but CiviCRM expects form-urlencoded with `params`?
// OR it expects JSON?
// The user said "it works in the previous version".
// The previous version had the SAME credential file content (just in a different folder).
// So the request definition itself should be correct.
// Let's try sending it as JSON first (n8n default for object body).

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log(`Status Code: ${res.statusCode}`);
        console.log(`Body: ${data}`);
    });
});

req.on('error', (error) => {
    console.error(error);
});

// If n8n sends as JSON:
// req.setHeader('Content-Type', 'application/json');
// req.write(requestBody);

// Wait, CiviCrm v4 API usually expects `params` parameter if using form-urlencoded, OR direct JSON?
// Let's look at `GenericFunctions.ts` again.
// It wraps the body in `params: JSON.stringify(body)`.
// The `test` request DOES NOT do that. It just sends `body: { version: 4 ... }`.
// Does n8n credential tester use the `authenticate` block? Yes.
// Does it use `GenericFunctions`? No.
// So if the `test` request works in the old version, then CiviCRM API4 MUST accept raw JSON body on that endpoint.
// Let's try sending standard JSON.

req.setHeader('Content-Type', 'application/json');
req.write(requestBody);
req.end();
