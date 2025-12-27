'use client';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-card/50">
      <div className="flex flex-col items-center justify-between gap-2 px-6 py-3 md:flex-row">
        {/* Left side - Copyright */}
        <div className="text-xs text-muted-foreground/70">
          © {currentYear} Bio-Exec KOL Research
        </div>

        {/* Center - Powered by */}
        <div className="text-xs text-muted-foreground/50">
          Powered by{' '}
          <a
            href="https://predica.care"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground transition-colors"
          >
            PreDiCa.care
          </a>
        </div>

        {/* Right side - Links */}
        <div className="flex items-center gap-4 text-xs">
          <a href="#" className="text-muted-foreground/70 transition-colors hover:text-foreground">
            Privacy
          </a>
          <a href="#" className="text-muted-foreground/70 transition-colors hover:text-foreground">
            Terms
          </a>
          <a href="#" className="text-muted-foreground/70 transition-colors hover:text-foreground">
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
