import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, buttonVariants } from '../button';

describe('Button component', () => {
  describe('rendering', () => {
    it('should render with default props', () => {
      render(<Button>Click me</Button>);

      const button = screen.getByRole('button', { name: 'Click me' });
      expect(button).toBeInTheDocument();
    });

    it('should render as a button element by default', () => {
      render(<Button>Click me</Button>);

      const button = screen.getByRole('button');
      expect(button.tagName).toBe('BUTTON');
    });

    it('should render children correctly', () => {
      render(
        <Button>
          <span>Icon</span>
          <span>Text</span>
        </Button>
      );

      expect(screen.getByText('Icon')).toBeInTheDocument();
      expect(screen.getByText('Text')).toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('should apply default variant classes', () => {
      render(<Button>Default</Button>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-primary');
    });

    it('should apply destructive variant classes', () => {
      render(<Button variant="destructive">Delete</Button>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-destructive');
    });

    it('should apply outline variant classes', () => {
      render(<Button variant="outline">Outline</Button>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('border');
    });

    it('should apply secondary variant classes', () => {
      render(<Button variant="secondary">Secondary</Button>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-secondary');
    });

    it('should apply ghost variant classes', () => {
      render(<Button variant="ghost">Ghost</Button>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('hover:bg-accent');
    });

    it('should apply link variant classes', () => {
      render(<Button variant="link">Link</Button>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('text-primary');
      expect(button.className).toContain('underline-offset-4');
    });
  });

  describe('sizes', () => {
    it('should apply default size classes', () => {
      render(<Button>Default Size</Button>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('h-10');
      expect(button.className).toContain('px-4');
    });

    it('should apply small size classes', () => {
      render(<Button size="sm">Small</Button>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('h-9');
      expect(button.className).toContain('px-3');
    });

    it('should apply large size classes', () => {
      render(<Button size="lg">Large</Button>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('h-11');
      expect(button.className).toContain('px-8');
    });

    it('should apply icon size classes', () => {
      render(<Button size="icon">🔍</Button>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('h-10');
      expect(button.className).toContain('w-10');
    });
  });

  describe('states', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button.className).toContain('disabled:opacity-50');
    });

    it('should apply custom className', () => {
      render(<Button className="custom-class">Custom</Button>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('custom-class');
    });
  });

  describe('events', () => {
    it('should call onClick handler when clicked', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', () => {
      const handleClick = vi.fn();
      render(<Button disabled onClick={handleClick}>Disabled</Button>);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('asChild prop', () => {
    it('should render as Slot when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/link">Link Button</a>
        </Button>
      );

      const link = screen.getByRole('link', { name: 'Link Button' });
      expect(link).toBeInTheDocument();
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/link');
    });
  });

  describe('ref forwarding', () => {
    it('should forward ref to button element', () => {
      const ref = { current: null } as React.RefObject<HTMLButtonElement>;

      render(<Button ref={ref}>Ref Button</Button>);

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });

  describe('buttonVariants', () => {
    it('should generate correct class string for default variant', () => {
      const classes = buttonVariants();
      expect(classes).toContain('bg-primary');
      expect(classes).toContain('h-10');
    });

    it('should generate correct class string for custom variant and size', () => {
      const classes = buttonVariants({ variant: 'destructive', size: 'lg' });
      expect(classes).toContain('bg-destructive');
      expect(classes).toContain('h-11');
    });
  });
});
