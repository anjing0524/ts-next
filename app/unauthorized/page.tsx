'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation'; // To read query parameters

export default function UnauthorizedPage() {
  const searchParams = useSearchParams();
  const attemptedPath = searchParams.get('attempted_path');
  const requiredPermission = searchParams.get('required_permission');
  const error = searchParams.get('error');

  let message = "You do not have permission to view this page.";

  if (error === 'unconfigured_protected_path' && attemptedPath) {
    message = `Access to the path "${attemptedPath}" is restricted, and it is not configured for specific permissions.`;
  } else if (attemptedPath && requiredPermission && requiredPermission !== 'unknown') {
    message = `You do not have the required permission ("${requiredPermission}") to access the page: "${attemptedPath}".`;
  } else if (attemptedPath) {
    message = `You do not have permission to access the page: "${attemptedPath}".`;
  }


  return (
    <div style={{
      fontFamily: 'Arial, sans-serif',
      textAlign: 'center',
      padding: '50px',
      color: '#333'
    }}>
      <h1 style={{ color: '#D32F2F', fontSize: '2.5em' }}>Unauthorized Access</h1>
      <p style={{ fontSize: '1.2em' }}>
        {message}
      </p>
      {requiredPermission && requiredPermission !== 'unknown' && (
        <p style={{ fontSize: '1em', color: '#757575' }}>
          (Required permission: <code>{requiredPermission}</code>)
        </p>
      )}
      {error && (
         <p style={{ fontSize: '1em', color: '#EF5350' }}>
          Error type: <code>{error}</code>
        </p>
      )}
      <div style={{ marginTop: '30px' }}>
        <Link href="/" style={{
          padding: '10px 20px',
          backgroundColor: '#1976D2',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '5px',
          marginRight: '10px'
        }}>
          Go to Homepage
        </Link>
        <Link href="/login" style={{
          padding: '10px 20px',
          backgroundColor: '#757575',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '5px'
        }}>
          Go to Login
        </Link>
      </div>
    </div>
  );
}
