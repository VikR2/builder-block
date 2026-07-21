import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container py-20 text-center">
      <div className="text-6xl mb-4">404</div>
      <h1 className="text-3xl font-bold mb-4">Page Not Found</h1>
      <p className="text-muted-foreground mb-6">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link href="/" className="text-amber-500 hover:text-amber-400 flex items-center justify-center gap-2">
        <span>←</span> Go Home
      </Link>
    </div>
  );
}
