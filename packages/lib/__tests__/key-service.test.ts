import { getKeyPair } from '../src/services/key-service';
import { exportJWK } from 'jose';

describe('Key Service', () => {
  it('should generate and return a valid RSA key pair', async () => {
    const { publicKey, privateKey } = await getKeyPair();

    expect(publicKey).toBeDefined();
    expect(privateKey).toBeDefined();

    // Export keys to JWK format to inspect their properties
    const publicJwk = await exportJWK(publicKey);
    const privateJwk = await exportJWK(privateKey);

    expect(publicJwk.kty).toBe('RSA');
    expect(privateJwk.kty).toBe('RSA');
  });

  it('should return the same key pair on subsequent calls', async () => {
    const { publicKey: firstPublicKey, privateKey: firstPrivateKey } = await getKeyPair();
    const { publicKey: secondPublicKey, privateKey: secondPrivateKey } = await getKeyPair();

    const firstPublicJwk = await exportJWK(firstPublicKey);
    const secondPublicJwk = await exportJWK(secondPublicKey);

    expect(firstPublicJwk).toEqual(secondPublicJwk);

    const firstPrivateJwk = await exportJWK(firstPrivateKey);
    const secondPrivateJwk = await exportJWK(secondPrivateKey);

    // Only compare the public parts, as private parts may differ in representation
    expect(firstPrivateJwk.n).toEqual(secondPrivateJwk.n);
    expect(firstPrivateJwk.e).toEqual(secondPrivateJwk.e);
  });
});
