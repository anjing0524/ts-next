import fs from 'fs'
import path from 'path'

export default async function globalTeardown() {
  console.log('🧹 Cleaning up test environment...')
  
  try {
    // Remove test database
    const testDbPath = path.join(process.cwd(), 'prisma', 'test.db')
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
      console.log('🗑️  Removed test database')
    }
    
    // Remove test database journal files if they exist
    const journalPath = `${testDbPath}-journal`
    if (fs.existsSync(journalPath)) {
      fs.unlinkSync(journalPath)
      console.log('🗑️  Removed test database journal')
    }
    
    const walPath = `${testDbPath}-wal`
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath)
      console.log('🗑️  Removed test database WAL file')
    }
    
    const shmPath = `${testDbPath}-shm`
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath)
      console.log('🗑️  Removed test database SHM file')
    }
    
    console.log('✅ Test environment cleanup complete')
  } catch (error) {
    console.error('❌ Failed to cleanup test environment:', error)
    // Don't throw error in teardown to avoid masking test failures
  }
}