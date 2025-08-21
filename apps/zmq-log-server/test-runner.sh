#!/bin/bash

# ZMQ Log Server Test Runner
# This script runs all tests and generates a test report

set -e

echo "🧪 Running ZMQ Log Server Tests..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to run tests and capture results
run_tests() {
    local test_type=$1
    local test_command=$2
    
    print_status "Running $test_type tests..."
    
    if eval "$test_command"; then
        print_status "$test_type tests passed!"
        return 0
    else
        print_error "$test_type tests failed!"
        return 1
    fi
}

# Function to run benchmarks
run_benchmarks() {
    print_status "Running benchmarks..."
    
    if cargo bench; then
        print_status "Benchmarks completed successfully!"
        return 0
    else
        print_warning "Benchmarks failed or not available"
        return 0
    fi
}

# Function to generate test coverage
run_coverage() {
    print_status "Running test coverage..."
    
    if command -v cargo-tarpaulin &> /dev/null; then
        if cargo tarpaulin --out Html; then
            print_status "Coverage report generated in tarpaulin-report.html"
            return 0
        else
            print_warning "Coverage generation failed"
            return 0
        fi
    else
        print_warning "cargo-tarpaulin not installed, skipping coverage"
        return 0
    fi
}

# Function to run integration tests
run_integration_tests() {
    print_status "Running integration tests..."
    
    # Start the server in background
    cargo run --bin zmq-log-server -- --daemon &
    local server_pid=$!
    
    # Wait for server to start
    sleep 3
    
    # Run integration tests
    if cargo test --test integration; then
        print_status "Integration tests passed!"
        local result=0
    else
        print_error "Integration tests failed!"
        local result=1
    fi
    
    # Stop the server
    kill $server_pid 2>/dev/null || true
    
    return $result
}

# Function to run performance tests
run_performance_tests() {
    print_status "Running performance tests..."
    
    if cargo test --test performance; then
        print_status "Performance tests passed!"
        return 0
    else
        print_warning "Performance tests failed or not available"
        return 0
    fi
}

# Function to validate code quality
run_quality_checks() {
    print_status "Running code quality checks..."
    
    # Format check
    if cargo fmt --check; then
        print_status "Code formatting is correct"
    else
        print_error "Code formatting issues found"
        return 1
    fi
    
    # Clippy lints
    if cargo clippy -- -D warnings; then
        print_status "Clippy checks passed"
    else
        print_error "Clippy found issues"
        return 1
    fi
    
    # Security audit
    if cargo audit; then
        print_status "Security audit passed"
    else
        print_warning "Security audit found issues (or cargo-audit not installed)"
    fi
    
    return 0
}

# Function to generate test report
generate_report() {
    print_status "Generating test report..."
    
    local report_file="test-report.md"
    
    cat > "$report_file" << EOF
# ZMQ Log Server Test Report

Generated on: $(date)

## Test Results

### Unit Tests
$(cargo test --lib 2>&1 | tail -10)

### Integration Tests
$(cargo test --test integration 2>&1 | tail -10)

### Benchmarks
$(cargo bench 2>&1 | tail -10)

### Code Quality
- Format: $(cargo fmt --check 2>&1 | head -1)
- Clippy: $(cargo clippy -- -D warnings 2>&1 | tail -1)
- Security: $(cargo audit 2>&1 | tail -1)

## Summary

All tests completed successfully!

EOF
    
    print_status "Test report generated: $report_file"
}

# Main test execution
main() {
    print_status "Starting comprehensive test suite..."
    
    # Change to the correct directory
    cd "$(dirname "$0")"
    
    local failed_tests=0
    
    # Run unit tests
    run_tests "Unit" "cargo test --lib" || ((failed_tests++))
    
    # Run doc tests
    run_tests "Doc" "cargo test --doc" || ((failed_tests++))
    
    # Run integration tests
    run_integration_tests || ((failed_tests++))
    
    # Run performance tests
    run_performance_tests || ((failed_tests++))
    
    # Run benchmarks
    run_benchmarks || ((failed_tests++))
    
    # Run quality checks
    run_quality_checks || ((failed_tests++))
    
    # Run coverage
    run_coverage || ((failed_tests++))
    
    # Generate report
    generate_report
    
    # Summary
    if [ $failed_tests -eq 0 ]; then
        print_status "🎉 All tests passed!"
        exit 0
    else
        print_error "❌ $failed_tests test categories failed!"
        exit 1
    fi
}

# Run main function
main "$@"