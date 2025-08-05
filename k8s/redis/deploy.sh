#!/bin/bash

# Redis Kubernetes Deployment Script
# This script deploys Redis to a Kubernetes cluster for development use

set -e

echo "🚀 Deploying Redis to Kubernetes..."

# Create namespace if it doesn't exist
echo "📦 Creating namespace (if not exists)..."
kubectl create namespace ts-next-template --dry-run=client -o yaml | kubectl apply -f -

# Apply Redis configurations
echo "🔧 Applying Redis configurations..."
kubectl apply -k . -n ts-next-template

# Wait for deployment to be ready
echo "⏳ Waiting for Redis deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/redis -n ts-next-template

# Get service information
echo "📋 Redis service information:"
kubectl get svc redis -n ts-next-template

# Get pod status
echo "📋 Redis pod status:"
kubectl get pods -l app=redis -n ts-next-template

echo "✅ Redis deployment completed!"
echo "🔗 Redis is accessible at: localhost:30379"
echo "🔑 Redis password: redis123"
echo ""
echo "📝 To connect to Redis:"
echo "   kubectl exec -it deployment/redis -n ts-next-template -- redis-cli -a redis123"
echo ""
echo "🗑️  To delete Redis:"
echo "   kubectl delete -k . -n ts-next-template"