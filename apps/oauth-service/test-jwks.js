#!/usr/bin/env node

const http = require('http');

// Simple test to verify JWKS endpoint works
console.log('Testing JWKS endpoint...');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/v2/oauth/jwks',
  method: 'GET',
  headers: {
    'Accept': 'application/json'
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log('Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const jwks = JSON.parse(data);
      console.log('JWKS Response:', JSON.stringify(jwks, null, 2));
      
      if (jwks.keys && Array.isArray(jwks.keys)) {
        console.log('✓ JWKS format is valid');
        console.log(`✓ Found ${jwks.keys.length} keys`);
        
        jwks.keys.forEach((key, index) => {
          console.log(`Key ${index + 1}:`, {
            kty: key.kty,
            kid: key.kid,
            use: key.use,
            alg: key.alg
          });
        });
      } else {
        console.error('✗ Invalid JWKS format');
      }
    } catch (error) {
      console.error('✗ Failed to parse JSON:', error.message);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('✗ Request failed:', error.message);
  console.log('Make sure the OAuth service is running on port 3001');
});

req.end();