'use client';

import { Suspense } from 'react';

function ConsentContent() {
  return (
    <div>
      <h1>Consent Page</h1>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ConsentContent />
    </Suspense>
  );
}
