import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

export default async function globalSetup() {
  console.log('🚀 Setting up test environment...')
  
  // Set test environment
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = 'file:./test.db'
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only'
  
  // Remove existing test database
  const testDbPath = path.join(process.cwd(), 'prisma', 'test.db')
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath)
    console.log('🗑️  Removed existing test database')
  }
  
  try {
    // Generate Prisma client
    console.log('📦 Generating Prisma client...')
    execSync('npx prisma generate', { stdio: 'inherit' })
    
    // Push database schema
    console.log('🏗️  Creating test database schema...')
    execSync('npx prisma db push --force-reset', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: 'file:./test.db' }
    })
    
    // Run seed for test data
    console.log('🌱 Seeding test database...')
    execSync('npx tsx prisma/seed.ts', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: 'file:./test.db' }
    })
    
    console.log('✅ Test environment setup complete')
  } catch (error) {
    console.error('❌ Failed to setup test environment:', error)
    throw error
  }
}