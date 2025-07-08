import { createVerifier } from '../src/auth/jwt-client-verifier';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import http from 'http';

const PORT = 8089; // Use a free port for the mock server
const JWKS_URL = `http://localhost:${PORT}/.well-known/jwks.json`;

let server: http.Server;
let keyPair: { publicKey: any; privateKey: any };

// Set up a mock JWKS server before all tests
beforeAll(async () => {
  keyPair = await generateKeyPair('RS256');
  const jwks = {
    keys: [
      {
        ...(await exportJWK(keyPair.publicKey)),
        kid: 'test-kid',
        alg: 'RS256',
        use: 'sig',
      },
    ],
  };

  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(jwks));
  });

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
});

// Shut down the server after all tests
afterAll((done) => {
  if (server) {
    server.close(done);
  } else {
    done();
  }
});

describe('JWT Client Verifier', () => {
  it('should create a verifier and successfully verify a valid token', async () => {
    const verifier = createVerifier(JWKS_URL);
    const token = await new SignJWT({ sub: 'user123' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);

    const { user, error } = await verifier.verify(token);

    expect(error).toBeNull();
    expect(user).not.toBeNull();
    expect(user?.sub).toBe('user123');
  });

  it('should return an error for an invalid token (wrong signature)', async () => {
    const verifier = createVerifier(JWKS_URL);
    const wrongKeyPair = await generateKeyPair('RS256');
    const token = await new SignJWT({ sub: 'user123' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(wrongKeyPair.privateKey);

    const { user, error } = await verifier.verify(token);

    expect(user).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toContain('signature verification failed');
  });

  it('should return an error for an expired token', async () => {
    const verifier = createVerifier(JWKS_URL);
    const token = await new SignJWT({ sub: 'user123' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuedAt()
      .setExpirationTime('0s') // Expired immediately
      .sign(keyPair.privateKey);

    const { user, error } = await verifier.verify(token);

    expect(user).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toContain('timestamp check failed');
  });

  it('should return an error if the kid does not match', async () => {
    const verifier = createVerifier(JWKS_URL);
    const token = await new SignJWT({ sub: 'user123' })
      .setProtectedHeader({ alg: 'RS256', kid: 'wrong-kid' })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);

    const { user, error } = await verifier.verify(token);

    expect(user).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toContain('no applicable key found');
  });
});
