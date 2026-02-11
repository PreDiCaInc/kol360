'use client';

import { Heart } from 'lucide-react';
import packageJson from '../../../package.json';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-card">
      <div className="flex flex-col items-center justify-between gap-2 px-6 py-4 md:flex-row">
        {/* Left side - Copyright + Version */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>© {currentYear} Bio-Exec. All rights reserved.</span>
          <span className="text-[10px] text-muted-foreground/60">v{packageJson.version}</span>
        </div>

        {/* Center - Powered by */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>Powered by</span>
          <a
            href="https://predica.care"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-primary transition-colors hover:text-primary/80"
          >
            <Heart className="h-3.5 w-3.5 fill-primary" />
            PreDiCa.care
          </a>
        </div>

        {/* Right side - Links */}
        <div className="flex items-center gap-4 text-sm">
          <a href="#" className="text-muted-foreground transition-colors hover:text-foreground">
            Privacy
          </a>
          <a href="#" className="text-muted-foreground transition-colors hover:text-foreground">
            Terms
          </a>
          <a href="#" className="text-muted-foreground transition-colors hover:text-foreground">
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
