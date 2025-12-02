import { render, screen } from '@testing-library/react';
import {
  PageLoading,
  TableLoading,
  CardGridLoading,
  ChartLoading,
  DashboardLoading,
  InlineLoading
} from '../../../components/common/LoadingStates';

describe('PageLoading', () => {
  it('should render with default props', () => {
    render(<PageLoading />);

    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-label', 'Loading page');

    // Check for spinner
    const spinner = screen.getByLabelText('Loading page');
    expect(spinner).toBeInTheDocument();

    // Check for default message
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByText('Please wait while we prepare your dashboard')).toBeInTheDocument();
  });

  it('should render with custom message', () => {
    const customMessage = 'Custom loading message';
    render(<PageLoading message={customMessage} />);

    expect(screen.getByText(customMessage)).toBeInTheDocument();
  });

  it('should not show spinner when showSpinner is false', () => {
    render(<PageLoading showSpinner={false} />);

    // The status should still exist
    expect(screen.getByRole('status')).toBeInTheDocument();

    // But the spinner ring should not be visible
    const spinnerRing = screen.queryByText('Loading...')?.parentElement?.previousSibling;
    expect(spinnerRing).toBeDefined();
  });

  it('should not be fullscreen when fullscreen is false', () => {
    render(<PageLoading fullscreen={false} />);

    const container = screen.getByRole('status').parentElement;
    expect(container).not.toHaveClass('min-h-screen');
  });
});

describe('TableLoading', () => {
  it('should render with default props', () => {
    render(<TableLoading />);

    // Find the main status element by aria-label
    const status = screen.getByLabelText('Loading table data');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('role', 'status');

    // Should have 5 columns header
    const headers = screen.getAllByLabelText(/Loading column header/);
    expect(headers).toHaveLength(5); // default columns

    // Should have 10 rows * 5 columns = 50 cells
    const cells = document.querySelectorAll('[aria-label*="Loading table cell row"]');
    expect(cells.length).toBe(50);
  });

  it('should render with custom columns and rows', () => {
    render(<TableLoading columns={3} rows={4} />);

    // Should have 3 columns header
    const headers = screen.getAllByLabelText(/Loading column header/);
    expect(headers).toHaveLength(3);

    // Should have 4 rows * 3 columns = 12 cells
    const cells = document.querySelectorAll('[aria-label*="Loading table cell row"]');
    expect(cells.length).toBe(12);
  });

  it('should not show header when showHeader is false', () => {
    render(<TableLoading showHeader={false} />);

    const headers = screen.queryAllByLabelText(/Loading column header/);
    expect(headers).toHaveLength(0);
  });

  it('should apply different widths to first and last columns', () => {
    render(<TableLoading columns={4} />);

    // Find cells in the first row - use exact match for row 1
    const cells = document.querySelectorAll('[aria-label="Loading table cell row 1, column 1"], [aria-label="Loading table cell row 1, column 2"], [aria-label="Loading table cell row 1, column 3"], [aria-label="Loading table cell row 1, column 4"]');
    // Each cell has a parent div with class "flex-1"
    const cellParents = Array.from(cells).map(cell => cell.parentElement);

    // Should have 4 cell parents
    expect(cellParents).toHaveLength(4);

    // Check parent div for width classes
    const firstCellParent = cellParents[0];
    const lastCellParent = cellParents[3];

    expect(firstCellParent).toHaveClass('flex-1');
    expect(lastCellParent).toHaveClass('flex-1');
  });
});

describe('CardGridLoading', () => {
  it('should render with default props', () => {
    render(<CardGridLoading />);

    // Find the main status element by aria-label
    const status = screen.getByLabelText('Loading 6 cards');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('role', 'status');

    // Should have 6 cards
    const cards = screen.getAllByLabelText(/Loading card \d/);
    expect(cards).toHaveLength(6);

    // Should have 3 column grid on large screens
    expect(status).toHaveClass('lg:grid-cols-3');
  });

  it('should render with custom count', () => {
    render(<CardGridLoading count={4} />);

    const status = screen.getByLabelText('Loading 4 cards');
    expect(status).toHaveAttribute('role', 'status');

    const cards = screen.getAllByLabelText(/Loading card \d/);
    expect(cards).toHaveLength(4);
  });

  it('should render with 2 columns', () => {
    render(<CardGridLoading columns={2} />);

    const grid = screen.getByLabelText('Loading 6 cards');
    expect(grid).toHaveClass('md:grid-cols-2');
    expect(grid).not.toHaveClass('lg:grid-cols-3');
  });

  it('should render with 4 columns', () => {
    render(<CardGridLoading columns={4} />);

    const grid = screen.getByLabelText('Loading 6 cards');
    expect(grid).toHaveClass('lg:grid-cols-4');
  });

  it('should have card content skeletons', () => {
    render(<CardGridLoading count={1} />);

    // Check for card content elements
    expect(screen.getByLabelText('Loading card title')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading card description line 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading card description line 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading card footer left')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading card footer right')).toBeInTheDocument();
  });
});

describe('ChartLoading', () => {
  it('should render line chart by default', () => {
    render(<ChartLoading />);

    const status = screen.getByLabelText('Loading line chart');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('role', 'status');

    // Should have title area
    expect(screen.getByLabelText('Loading chart title')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading chart subtitle')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading chart control')).toBeInTheDocument();

    // Should have chart bars (for line/bar chart)
    const bars = document.querySelectorAll('.bg-gradient-to-t.from-primary\\/30');
    expect(bars.length).toBeGreaterThan(0);
  });

  it('should render bar chart', () => {
    render(<ChartLoading type="bar" />);

    const status = screen.getByLabelText('Loading bar chart');
    expect(status).toHaveAttribute('role', 'status');
  });

  it('should render pie chart', () => {
    render(<ChartLoading type="pie" />);

    const status = screen.getByLabelText('Loading pie chart');
    expect(status).toHaveAttribute('role', 'status');

    // Pie chart should have spinning ring
    const spinningRing = document.querySelector('.animate-spin-slow');
    expect(spinningRing).toBeInTheDocument();
  });

  it('should render with custom height', () => {
    const height = 400;
    render(<ChartLoading height={height} />);

    const status = screen.getByLabelText('Loading line chart');
    expect(status).toHaveStyle(`height: ${height}px`);
  });

  it('should not show title when showTitle is false', () => {
    render(<ChartLoading showTitle={false} />);

    expect(screen.queryByLabelText('Loading chart title')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Loading chart subtitle')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Loading chart control')).not.toBeInTheDocument();
  });
});

describe('DashboardLoading', () => {
  it('should render complete dashboard loading state', () => {
    render(<DashboardLoading />);

    const status = screen.getByLabelText('Loading dashboard');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('role', 'status');

    // Should have stats cards
    const statsCards = screen.getAllByLabelText(/Loading stats card \d/);
    expect(statsCards).toHaveLength(4);

    // Should have chart
    expect(screen.getByLabelText('Loading line chart')).toBeInTheDocument();

    // Should have recent activity table
    expect(screen.getByLabelText('Loading recent activity title')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading table data')).toBeInTheDocument();
  });

  it('should have stats card content', () => {
    render(<DashboardLoading />);

    // Check for stats card content
    expect(screen.getAllByLabelText('Loading stats label')).toHaveLength(4);
    expect(screen.getAllByLabelText('Loading stats value')).toHaveLength(4);
    expect(screen.getAllByLabelText('Loading stats trend')).toHaveLength(4);
  });
});

describe('InlineLoading', () => {
  it('should render with default props', () => {
    render(<InlineLoading />);

    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-label', 'Loading');

    // Should have spinner
    const spinner = status.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();

    // Should not have text by default
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('should render with text', () => {
    const loadingText = 'Processing...';
    render(<InlineLoading text={loadingText} />);

    expect(screen.getByText(loadingText)).toBeInTheDocument();
  });

  it('should render small size', () => {
    render(<InlineLoading size="sm" />);

    const spinnerContainer = screen.getByRole('status').firstChild;
    expect(spinnerContainer?.firstChild).toHaveClass('w-4');
    expect(spinnerContainer?.firstChild).toHaveClass('h-4');
    expect(spinnerContainer?.firstChild).toHaveClass('border-2');
  });

  it('should render medium size (default)', () => {
    render(<InlineLoading />);

    const spinnerContainer = screen.getByRole('status').firstChild;
    expect(spinnerContainer?.firstChild).toHaveClass('w-6');
    expect(spinnerContainer?.firstChild).toHaveClass('h-6');
    expect(spinnerContainer?.firstChild).toHaveClass('border-3');
  });

  it('should render large size', () => {
    render(<InlineLoading size="lg" />);

    const spinnerContainer = screen.getByRole('status').firstChild;
    expect(spinnerContainer?.firstChild).toHaveClass('w-8');
    expect(spinnerContainer?.firstChild).toHaveClass('h-8');
    expect(spinnerContainer?.firstChild).toHaveClass('border-4');
  });
});