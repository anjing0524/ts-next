/**
 * Component tests for ErrorDisplay
 */

import { render, screen, fireEvent, waitFor } from '../../test/test-utils';
import { ErrorDisplay } from '@/components/common/error-display';

describe('ErrorDisplay', () => {
  const mockError = new Error('Test error message');
  const mockOnRetry = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders error with default message', () => {
    render(<ErrorDisplay error={mockError} />);

    expect(screen.getByText('发生错误')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('renders with custom title', () => {
    render(<ErrorDisplay error={mockError} title="Custom Error Title" />);

    expect(screen.getByText('Custom Error Title')).toBeInTheDocument();
  });

  it('renders with custom message', () => {
    render(<ErrorDisplay error={mockError} message="Custom error message" />);

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
  });

  it('shows retry button when onRetry is provided', () => {
    render(<ErrorDisplay error={mockError} onRetry={mockOnRetry} />);

    const retryButton = screen.getByText('重试');
    expect(retryButton).toBeInTheDocument();
    
    fireEvent.click(retryButton);
    expect(mockOnRetry).toHaveBeenCalled();
  });

  it('shows close button when onClose is provided', () => {
    const mockOnClose = jest.fn();
    render(<ErrorDisplay error={mockError} onClose={mockOnClose} />);

    const closeButton = screen.getByText('关闭');
    expect(closeButton).toBeInTheDocument();
    
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('applies custom className', () => {
    render(<ErrorDisplay error={mockError} className="custom-error-class" />);

    const errorContainer = screen.getByText('发生错误').closest('div');
    expect(errorContainer).toHaveClass('custom-error-class');
  });

  it('renders with different error types', () => {
    const networkError = new Error('Network error');
    render(<ErrorDisplay error={networkError} />);

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('handles null error gracefully', () => {
    render(<ErrorDisplay error={null} />);

    expect(screen.getByText('发生错误')).toBeInTheDocument();
  });

  it('handles undefined error gracefully', () => {
    render(<ErrorDisplay error={undefined} />);

    expect(screen.getByText('发生错误')).toBeInTheDocument();
  });

  it('shows appropriate icon for error', () => {
    render(<ErrorDisplay error={mockError} />);

    const alertIcon = screen.getByTestId('alert-icon');
    expect(alertIcon).toBeInTheDocument();
  });

  it('renders with different variants', () => {
    const { rerender } = render(<ErrorDisplay error={mockError} variant="warning" />);

    expect(screen.getByText('警告')).toBeInTheDocument();

    rerender(<ErrorDisplay error={mockError} variant="info" />);
    expect(screen.getByText('提示')).toBeInTheDocument();

    rerender(<ErrorDisplay error={mockError} variant="success" />);
    expect(screen.getByText('成功')).toBeInTheDocument();
  });

  it('renders with custom actions', () => {
    render(
      <ErrorDisplay 
        error={mockError} 
        actions={<button data-testid="custom-action">Custom Action</button>}
      />
    );

    expect(screen.getByTestId('custom-action')).toBeInTheDocument();
  });

  it('shows stack trace when showStackTrace is true', () => {
    const errorWithStack = new Error('Error with stack');
    errorWithStack.stack = 'Error: Error with stack\\n    at test (test.js:1:1)';

    render(<ErrorDisplay error={errorWithStack} showStackTrace />);

    expect(screen.getByText('Error: Error with stack')).toBeInTheDocument();
    expect(screen.getByText('at test (test.js:1:1)')).toBeInTheDocument();
  });

  it('does not show stack trace when showStackTrace is false', () => {
    const errorWithStack = new Error('Error with stack');
    errorWithStack.stack = 'Error: Error with stack\\n    at test (test.js:1:1)';

    render(<ErrorDisplay error={errorWithStack} showStackTrace={false} />);

    expect(screen.queryByText('at test (test.js:1:1)')).not.toBeInTheDocument();
  });

  it('renders with custom icon', () => {
    render(
      <ErrorDisplay 
        error={mockError} 
        icon={<div data-testid="custom-icon">Custom Icon</div>}
      />
    );

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });
});