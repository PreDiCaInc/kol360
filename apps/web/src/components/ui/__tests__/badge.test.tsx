import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, badgeVariants } from '../badge';

describe('Badge', () => {
  describe('rendering', () => {
    it('renders badge with text', () => {
      render(<Badge>Status</Badge>);
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    it('renders with default variant', () => {
      render(<Badge>Default</Badge>);
      const badge = screen.getByText('Default');
      expect(badge).toHaveClass('bg-primary');
    });

    it('renders children correctly', () => {
      render(
        <Badge>
          <span data-testid="child">Child Content</span>
        </Badge>
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('renders secondary variant', () => {
      render(<Badge variant="secondary">Secondary</Badge>);
      const badge = screen.getByText('Secondary');
      expect(badge).toHaveClass('bg-secondary');
    });

    it('renders destructive variant', () => {
      render(<Badge variant="destructive">Error</Badge>);
      const badge = screen.getByText('Error');
      expect(badge).toHaveClass('bg-destructive');
    });

    it('renders outline variant', () => {
      render(<Badge variant="outline">Outline</Badge>);
      const badge = screen.getByText('Outline');
      expect(badge).toHaveClass('border');
    });

    it('renders success variant', () => {
      render(<Badge variant="success">Success</Badge>);
      const badge = screen.getByText('Success');
      expect(badge).toHaveClass('bg-emerald-50');
    });

    it('renders warning variant', () => {
      render(<Badge variant="warning">Warning</Badge>);
      const badge = screen.getByText('Warning');
      expect(badge).toHaveClass('bg-amber-50');
    });

    it('renders muted variant', () => {
      render(<Badge variant="muted">Muted</Badge>);
      const badge = screen.getByText('Muted');
      expect(badge).toHaveClass('bg-slate-100');
    });
  });

  describe('props', () => {
    it('applies custom className', () => {
      render(<Badge className="custom-class">Custom</Badge>);
      const badge = screen.getByText('Custom');
      expect(badge).toHaveClass('custom-class');
    });

    it('forwards HTML attributes', () => {
      render(<Badge data-testid="test-badge">Test</Badge>);
      expect(screen.getByTestId('test-badge')).toBeInTheDocument();
    });
  });

  describe('badgeVariants', () => {
    it('generates correct class names for default variant', () => {
      const classes = badgeVariants({ variant: 'default' });
      expect(classes).toContain('bg-primary');
    });

    it('generates correct class names for destructive variant', () => {
      const classes = badgeVariants({ variant: 'destructive' });
      expect(classes).toContain('bg-destructive');
    });

    it('uses defaults when no options provided', () => {
      const classes = badgeVariants({});
      expect(classes).toContain('bg-primary');
    });
  });
});
