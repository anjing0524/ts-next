import { generateKeyPair, type KeyLike } from 'jose';

let privateKey: KeyLike | undefined;
let publicKey: KeyLike | undefined;

// In a real-world application, these keys should be stored securely,
// for example, in a secret manager or as environment variables.
// For this example, we will generate them in memory.

/**
 * Retrieves the RSA key pair (public and private keys).
 * If the key pair has not been generated yet, it will be generated
 * and stored in memory for subsequent calls.
 *
 * @returns A promise that resolves to an object containing the public and private keys.
 */
export async function getKeyPair(): Promise<{
  publicKey: KeyLike;
  privateKey: KeyLike;
}> {
  if (!privateKey || !publicKey) {
    const { publicKey: newPublicKey, privateKey: newPrivateKey } =
      await generateKeyPair('RS256');
    publicKey = newPublicKey;
    privateKey = newPrivateKey;
  }

  return { publicKey, privateKey };
}
