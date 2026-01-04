import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '../input';

describe('Input', () => {
  describe('rendering', () => {
    it('renders input element', () => {
      render(<Input data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toBeInTheDocument();
    });

    it('renders with placeholder', () => {
      render(<Input placeholder="Enter text..." />);
      expect(screen.getByPlaceholderText('Enter text...')).toBeInTheDocument();
    });

    it('renders with default value', () => {
      render(<Input defaultValue="default text" data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveValue('default text');
    });

    it('renders with controlled value', () => {
      render(<Input value="controlled value" onChange={() => {}} data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveValue('controlled value');
    });
  });

  describe('types', () => {
    it('renders without explicit type (browser defaults to text)', () => {
      render(<Input data-testid="test-input" />);
      // Browser default is 'text' when type attribute is not set
      const input = screen.getByTestId('test-input');
      expect(input.tagName).toBe('INPUT');
    });

    it('renders password input', () => {
      render(<Input type="password" data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveAttribute('type', 'password');
    });

    it('renders email input', () => {
      render(<Input type="email" data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveAttribute('type', 'email');
    });

    it('renders number input', () => {
      render(<Input type="number" data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveAttribute('type', 'number');
    });

    it('renders search input', () => {
      render(<Input type="search" data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveAttribute('type', 'search');
    });
  });

  describe('states', () => {
    it('can be disabled', () => {
      render(<Input disabled data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toBeDisabled();
    });

    it('can be read-only', () => {
      render(<Input readOnly data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveAttribute('readonly');
    });

    it('can be required', () => {
      render(<Input required data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toBeRequired();
    });
  });

  describe('interactions', () => {
    it('handles onChange event', async () => {
      const handleChange = vi.fn();
      render(<Input onChange={handleChange} data-testid="test-input" />);

      await userEvent.type(screen.getByTestId('test-input'), 'test');

      expect(handleChange).toHaveBeenCalled();
    });

    it('handles onBlur event', () => {
      const handleBlur = vi.fn();
      render(<Input onBlur={handleBlur} data-testid="test-input" />);

      fireEvent.blur(screen.getByTestId('test-input'));

      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it('handles onFocus event', () => {
      const handleFocus = vi.fn();
      render(<Input onFocus={handleFocus} data-testid="test-input" />);

      fireEvent.focus(screen.getByTestId('test-input'));

      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('allows typing text', async () => {
      render(<Input data-testid="test-input" />);

      await userEvent.type(screen.getByTestId('test-input'), 'Hello World');

      expect(screen.getByTestId('test-input')).toHaveValue('Hello World');
    });
  });

  describe('styling', () => {
    it('applies custom className', () => {
      render(<Input className="custom-class" data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveClass('custom-class');
    });

    it('has base styling classes', () => {
      render(<Input data-testid="test-input" />);
      const input = screen.getByTestId('test-input');
      expect(input).toHaveClass('flex');
      expect(input).toHaveClass('rounded-lg');
      expect(input).toHaveClass('border');
    });
  });

  describe('attributes', () => {
    it('forwards id attribute', () => {
      render(<Input id="my-input" data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveAttribute('id', 'my-input');
    });

    it('forwards name attribute', () => {
      render(<Input name="my-field" data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveAttribute('name', 'my-field');
    });

    it('forwards min/max attributes', () => {
      render(<Input type="number" min={0} max={100} data-testid="test-input" />);
      const input = screen.getByTestId('test-input');
      expect(input).toHaveAttribute('min', '0');
      expect(input).toHaveAttribute('max', '100');
    });

    it('forwards maxLength attribute', () => {
      render(<Input maxLength={50} data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveAttribute('maxlength', '50');
    });

    it('forwards autoComplete attribute', () => {
      render(<Input autoComplete="email" data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveAttribute('autocomplete', 'email');
    });

    it('forwards aria-label attribute', () => {
      render(<Input aria-label="Email address" data-testid="test-input" />);
      expect(screen.getByTestId('test-input')).toHaveAttribute('aria-label', 'Email address');
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to input element', () => {
      const ref = { current: null } as React.RefObject<HTMLInputElement>;
      render(<Input ref={ref} data-testid="test-input" />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });
  });
});
