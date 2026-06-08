import http from 'node:http';

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3002,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTest() {
  console.log("Creating template...");
  const createRes = await makeRequest('POST', '/api/templates', {
    name: 'Test Template',
    config: { preset: 'a4', widthMm: 210 }
  });
  console.log("Create Res:", createRes);
  const id = createRes.id;

  console.log("Listing templates...");
  const listRes = await makeRequest('GET', '/api/templates');
  console.log("List Res:", listRes);

  console.log("Getting template...");
  const getRes = await makeRequest('GET', '/api/templates/' + id);
  console.log("Get Res:", getRes);

  console.log("Updating template...");
  const updateRes = await makeRequest('PUT', '/api/templates/' + id, {
    name: 'Updated Template',
    config: { preset: 'cartao', widthMm: 156 }
  });
  console.log("Update Res:", updateRes);

  console.log("Deleting template...");
  const deleteRes = await makeRequest('DELETE', '/api/templates/' + id);
  console.log("Delete Res:", deleteRes);
}

runTest();
