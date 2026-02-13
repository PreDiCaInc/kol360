'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Something went wrong</h2>
          <button
            onClick={() => reset()}
            style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #ccc', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
