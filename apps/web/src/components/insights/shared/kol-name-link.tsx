'use client';

interface KolNameLinkProps {
  name: string;
  onClick: () => void;
}

export function KolNameLink({ name, onClick }: KolNameLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left font-medium"
    >
      {name}
    </button>
  );
}
