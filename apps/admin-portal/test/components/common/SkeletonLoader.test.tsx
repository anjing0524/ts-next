import { render, screen } from '@testing-library/react';
import {
  SkeletonLoader,
  TextSkeleton,
  CardSkeleton,
  AvatarSkeleton,
  TableSkeleton,
  ChartSkeleton,
  ButtonSkeleton
} from '../../../components/common/SkeletonLoader';

describe('SkeletonLoader', () => {
  it('should render text variant by default', () => {
    render(<SkeletonLoader />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveClass('h-4'); // text variant height
    expect(skeleton).toHaveClass('animate-pulse');
  });

  it('should render card variant', () => {
    render(<SkeletonLoader variant="card" />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('h-48'); // card variant height
  });

  it('should render avatar variant', () => {
    render(<SkeletonLoader variant="avatar" />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('rounded-full'); // avatar rounded style
    expect(skeleton).toHaveClass('h-12');
    expect(skeleton).toHaveClass('w-12');
  });

  it('should render table variant', () => {
    render(<SkeletonLoader variant="table" />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('h-8'); // table variant height
  });

  it('should render chart variant', () => {
    render(<SkeletonLoader variant="chart" />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('h-64'); // chart variant height
  });

  it('should render button variant', () => {
    render(<SkeletonLoader variant="button" />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('rounded-md'); // button rounded style
    expect(skeleton).toHaveClass('h-10'); // button height
  });

  it('should render multiple skeletons with count prop', () => {
    render(<SkeletonLoader count={3} />);
    const skeletons = screen.getAllByRole('status');
    expect(skeletons).toHaveLength(3);

    const container = screen.getByRole('list');
    expect(container).toHaveAttribute('aria-label', '3 loading items');
  });

  it('should apply shimmer effect when shimmer prop is true', () => {
    render(<SkeletonLoader shimmer={true} />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('relative');
    expect(skeleton).toHaveClass('overflow-hidden');

    // Check for shimmer overlay
    const shimmerOverlay = skeleton.querySelector('div[aria-hidden="true"]');
    expect(shimmerOverlay).toBeInTheDocument();
  });

  it('should not apply shimmer effect when shimmer prop is false', () => {
    render(<SkeletonLoader shimmer={false} />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).not.toHaveClass('relative');
    expect(skeleton).not.toHaveClass('overflow-hidden');
  });

  it('should apply pulse animation by default', () => {
    render(<SkeletonLoader />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('animate-pulse');
  });

  it('should apply pulse-slow animation when pulse prop is true', () => {
    render(<SkeletonLoader pulse={true} />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('animate-pulse-slow');
  });

  it('should apply custom width', () => {
    render(<SkeletonLoader width="w-1/2" />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('w-1/2');
  });

  it('should apply custom height', () => {
    render(<SkeletonLoader height="h-20" />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('h-20');
  });

  it('should apply custom rounded style', () => {
    render(<SkeletonLoader rounded="rounded-xl" />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('rounded-xl');
  });

  it('should apply custom aria-label', () => {
    const customLabel = 'Loading user profile';
    render(<SkeletonLoader aria-label={customLabel} />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveAttribute('aria-label', customLabel);

    const srOnly = screen.getByText(customLabel);
    expect(srOnly).toHaveClass('sr-only');
  });

  it('should apply custom className', () => {
    render(<SkeletonLoader className="custom-class" />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('custom-class');
  });
});

describe('Pre-configured Skeleton Components', () => {
  it('should render TextSkeleton', () => {
    render(<TextSkeleton />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('h-4'); // text variant
  });

  it('should render CardSkeleton', () => {
    render(<CardSkeleton />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('h-48'); // card variant
  });

  it('should render AvatarSkeleton', () => {
    render(<AvatarSkeleton />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('rounded-full'); // avatar rounded
    expect(skeleton).toHaveClass('h-12');
    expect(skeleton).toHaveClass('w-12');
  });

  it('should render TableSkeleton', () => {
    render(<TableSkeleton />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('h-8'); // table variant
  });

  it('should render ChartSkeleton', () => {
    render(<ChartSkeleton />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('h-64'); // chart variant
  });

  it('should render ButtonSkeleton', () => {
    render(<ButtonSkeleton />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass('rounded-md'); // button rounded
    expect(skeleton).toHaveClass('h-10'); // button height
  });

  it('should pass props to pre-configured components', () => {
    render(<TextSkeleton count={2} shimmer={false} className="test-class" />);
    const skeletons = screen.getAllByRole('status');
    expect(skeletons).toHaveLength(2);

    skeletons.forEach(skeleton => {
      expect(skeleton).toHaveClass('test-class');
      expect(skeleton).not.toHaveClass('relative'); // no shimmer
    });
  });
});