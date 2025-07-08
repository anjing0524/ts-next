import {
  jwtVerify,
  createRemoteJWKSet,
  type JWTVerifyResult,
  type JWTPayload,
} from 'jose';

interface VerificationResult {
  user: JWTPayload | null;
  error: Error | null;
}

/**
 * Creates a verifier object that can be used to verify JWTs
 * against a remote JWKS (JSON Web Key Set).
 *
 * @param jwksUrl The URL of the JWKS endpoint.
 * @returns An object with a `verify` method.
 */
export function createVerifier(jwksUrl: string | URL) {
  const JWKS = createRemoteJWKSet(new URL(jwksUrl));

  /**
   * Verifies a JWT string using the remote JWKS.
   *
   * @param token The JWT string to verify.
   * @returns A promise that resolves to an object containing the user payload or an error.
   */
  async function verify(token: string): Promise<VerificationResult> {
    try {
      const { payload }: JWTVerifyResult = await jwtVerify(token, JWKS);
      return { user: payload, error: null };
    } catch (e: unknown) {
      if (e instanceof Error) {
        return { user: null, error: e };
      }
      return { user: null, error: new Error('An unknown error occurred during token verification.') };
    }
  }

  return {
    verify,
  };
}
