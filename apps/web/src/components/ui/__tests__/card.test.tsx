import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from '../card';

describe('Card Components', () => {
  describe('Card', () => {
    it('renders children', () => {
      render(<Card>Card content</Card>);
      expect(screen.getByText('Card content')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<Card className="custom-class" data-testid="card">Content</Card>);
      expect(screen.getByTestId('card')).toHaveClass('custom-class');
    });

    it('has base styling classes', () => {
      render(<Card data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('rounded-xl');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('bg-card');
    });

    it('forwards HTML attributes', () => {
      render(<Card data-testid="test-card" id="my-card">Content</Card>);
      expect(screen.getByTestId('test-card')).toHaveAttribute('id', 'my-card');
    });

    it('forwards ref to div element', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement>;
      render(<Card ref={ref}>Content</Card>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('CardHeader', () => {
    it('renders children', () => {
      render(<CardHeader>Header content</CardHeader>);
      expect(screen.getByText('Header content')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<CardHeader className="custom-header" data-testid="header">Content</CardHeader>);
      expect(screen.getByTestId('header')).toHaveClass('custom-header');
    });

    it('has base styling with padding', () => {
      render(<CardHeader data-testid="header">Content</CardHeader>);
      expect(screen.getByTestId('header')).toHaveClass('p-6');
    });

    it('forwards ref', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement>;
      render(<CardHeader ref={ref}>Content</CardHeader>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('CardTitle', () => {
    it('renders children', () => {
      render(<CardTitle>Title text</CardTitle>);
      expect(screen.getByText('Title text')).toBeInTheDocument();
    });

    it('renders as h3 element', () => {
      render(<CardTitle>Title</CardTitle>);
      expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<CardTitle className="custom-title" data-testid="title">Title</CardTitle>);
      expect(screen.getByTestId('title')).toHaveClass('custom-title');
    });

    it('has font styling classes', () => {
      render(<CardTitle data-testid="title">Title</CardTitle>);
      const title = screen.getByTestId('title');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('text-lg');
    });

    it('forwards ref', () => {
      const ref = { current: null } as React.RefObject<HTMLParagraphElement>;
      render(<CardTitle ref={ref}>Title</CardTitle>);
      expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
    });
  });

  describe('CardDescription', () => {
    it('renders children', () => {
      render(<CardDescription>Description text</CardDescription>);
      expect(screen.getByText('Description text')).toBeInTheDocument();
    });

    it('renders as p element', () => {
      render(<CardDescription data-testid="desc">Description</CardDescription>);
      expect(screen.getByTestId('desc').tagName).toBe('P');
    });

    it('applies custom className', () => {
      render(<CardDescription className="custom-desc" data-testid="desc">Desc</CardDescription>);
      expect(screen.getByTestId('desc')).toHaveClass('custom-desc');
    });

    it('has muted text styling', () => {
      render(<CardDescription data-testid="desc">Description</CardDescription>);
      expect(screen.getByTestId('desc')).toHaveClass('text-muted-foreground');
    });

    it('forwards ref', () => {
      const ref = { current: null } as React.RefObject<HTMLParagraphElement>;
      render(<CardDescription ref={ref}>Description</CardDescription>);
      expect(ref.current).toBeInstanceOf(HTMLParagraphElement);
    });
  });

  describe('CardContent', () => {
    it('renders children', () => {
      render(<CardContent>Content body</CardContent>);
      expect(screen.getByText('Content body')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<CardContent className="custom-content" data-testid="content">Content</CardContent>);
      expect(screen.getByTestId('content')).toHaveClass('custom-content');
    });

    it('has padding classes', () => {
      render(<CardContent data-testid="content">Content</CardContent>);
      const content = screen.getByTestId('content');
      expect(content).toHaveClass('p-6');
      expect(content).toHaveClass('pt-0');
    });

    it('forwards ref', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement>;
      render(<CardContent ref={ref}>Content</CardContent>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('CardFooter', () => {
    it('renders children', () => {
      render(<CardFooter>Footer content</CardFooter>);
      expect(screen.getByText('Footer content')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<CardFooter className="custom-footer" data-testid="footer">Footer</CardFooter>);
      expect(screen.getByTestId('footer')).toHaveClass('custom-footer');
    });

    it('has flex and padding classes', () => {
      render(<CardFooter data-testid="footer">Footer</CardFooter>);
      const footer = screen.getByTestId('footer');
      expect(footer).toHaveClass('flex');
      expect(footer).toHaveClass('items-center');
      expect(footer).toHaveClass('p-6');
    });

    it('forwards ref', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement>;
      render(<CardFooter ref={ref}>Footer</CardFooter>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('Full Card composition', () => {
    it('renders all card parts together', () => {
      render(
        <Card data-testid="full-card">
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card Description</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Main content goes here</p>
          </CardContent>
          <CardFooter>
            <button>Action</button>
          </CardFooter>
        </Card>
      );

      expect(screen.getByTestId('full-card')).toBeInTheDocument();
      expect(screen.getByText('Card Title')).toBeInTheDocument();
      expect(screen.getByText('Card Description')).toBeInTheDocument();
      expect(screen.getByText('Main content goes here')).toBeInTheDocument();
      expect(screen.getByText('Action')).toBeInTheDocument();
    });

    it('maintains proper DOM structure', () => {
      render(
        <Card data-testid="card">
          <CardHeader data-testid="header">
            <CardTitle data-testid="title">Title</CardTitle>
          </CardHeader>
          <CardContent data-testid="content">Content</CardContent>
        </Card>
      );

      const card = screen.getByTestId('card');
      const header = screen.getByTestId('header');
      const title = screen.getByTestId('title');
      const content = screen.getByTestId('content');

      expect(card).toContainElement(header);
      expect(card).toContainElement(content);
      expect(header).toContainElement(title);
    });
  });
});
