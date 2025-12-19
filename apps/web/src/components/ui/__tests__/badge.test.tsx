import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, badgeVariants } from '../badge';

describe('Badge component', () => {
  describe('rendering', () => {
    it('should render with default props', () => {
      render(<Badge>Default</Badge>);

      const badge = screen.getByText('Default');
      expect(badge).toBeInTheDocument();
    });

    it('should render as a div element', () => {
      render(<Badge>Badge</Badge>);

      const badge = screen.getByText('Badge');
      expect(badge.tagName).toBe('DIV');
    });

    it('should render children correctly', () => {
      render(
        <Badge>
          <span>Status:</span> Active
        </Badge>
      );

      expect(screen.getByText('Status:')).toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('should apply default variant classes', () => {
      render(<Badge>Default</Badge>);

      const badge = screen.getByText('Default');
      expect(badge.className).toContain('bg-primary');
      expect(badge.className).toContain('text-primary-foreground');
    });

    it('should apply secondary variant classes', () => {
      render(<Badge variant="secondary">Secondary</Badge>);

      const badge = screen.getByText('Secondary');
      expect(badge.className).toContain('bg-secondary');
      expect(badge.className).toContain('text-secondary-foreground');
    });

    it('should apply destructive variant classes', () => {
      render(<Badge variant="destructive">Error</Badge>);

      const badge = screen.getByText('Error');
      expect(badge.className).toContain('bg-destructive');
      expect(badge.className).toContain('text-destructive-foreground');
    });

    it('should apply outline variant classes', () => {
      render(<Badge variant="outline">Outline</Badge>);

      const badge = screen.getByText('Outline');
      expect(badge.className).toContain('text-foreground');
      expect(badge.className).not.toContain('bg-primary');
    });
  });

  describe('styling', () => {
    it('should have rounded-full class', () => {
      render(<Badge>Rounded</Badge>);

      const badge = screen.getByText('Rounded');
      expect(badge.className).toContain('rounded-full');
    });

    it('should have text-xs class for small text', () => {
      render(<Badge>Small</Badge>);

      const badge = screen.getByText('Small');
      expect(badge.className).toContain('text-xs');
    });

    it('should have font-semibold class', () => {
      render(<Badge>Bold</Badge>);

      const badge = screen.getByText('Bold');
      expect(badge.className).toContain('font-semibold');
    });

    it('should apply custom className', () => {
      render(<Badge className="custom-class">Custom</Badge>);

      const badge = screen.getByText('Custom');
      expect(badge.className).toContain('custom-class');
    });
  });

  describe('accessibility', () => {
    it('should allow passing aria attributes', () => {
      render(<Badge aria-label="Status badge">Active</Badge>);

      const badge = screen.getByLabelText('Status badge');
      expect(badge).toBeInTheDocument();
    });

    it('should have focus ring styles', () => {
      render(<Badge>Focusable</Badge>);

      const badge = screen.getByText('Focusable');
      expect(badge.className).toContain('focus:ring-2');
    });
  });

  describe('badgeVariants', () => {
    it('should generate correct class string for default variant', () => {
      const classes = badgeVariants();
      expect(classes).toContain('bg-primary');
      expect(classes).toContain('rounded-full');
    });

    it('should generate correct class string for secondary variant', () => {
      const classes = badgeVariants({ variant: 'secondary' });
      expect(classes).toContain('bg-secondary');
    });

    it('should generate correct class string for destructive variant', () => {
      const classes = badgeVariants({ variant: 'destructive' });
      expect(classes).toContain('bg-destructive');
    });

    it('should generate correct class string for outline variant', () => {
      const classes = badgeVariants({ variant: 'outline' });
      expect(classes).toContain('text-foreground');
    });
  });

  describe('common use cases', () => {
    it('should render status badges', () => {
      render(
        <div>
          <Badge variant="default">Active</Badge>
          <Badge variant="secondary">Pending</Badge>
          <Badge variant="destructive">Error</Badge>
          <Badge variant="outline">Draft</Badge>
        </div>
      );

      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('should render count badges', () => {
      render(<Badge>99+</Badge>);

      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('should render with icons', () => {
      render(
        <Badge>
          ✓ Verified
        </Badge>
      );

      expect(screen.getByText('✓ Verified')).toBeInTheDocument();
    });
  });
});
