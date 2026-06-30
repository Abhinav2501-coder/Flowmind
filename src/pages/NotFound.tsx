import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-text p-6 text-center">
      <h1 className="text-9xl font-black text-primary/20 mb-4 font-display">404</h1>
      <h2 className="text-3xl font-bold mb-4 font-display">Page Not Found</h2>
      <p className="text-muted mb-8 max-w-md">
        We couldn't find the page you're looking for. It might have been moved or deleted.
      </p>
      <Link 
        to="/dashboard" 
        className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-all"
      >
        <Home className="w-5 h-5" />
        Back to Dashboard
      </Link>
    </div>
  );
}
