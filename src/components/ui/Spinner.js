import { Loader2 } from 'lucide-react';

const SIZES = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };

export default function Spinner({ size = 'md', className = '' }) {
  return (
    <Loader2
      className={`animate-spin text-blue-700 ${SIZES[size] || SIZES.md} ${className}`}
      aria-hidden="true"
    />
  );
}
