import { chromium, FullConfig } from '@playwright/test';

/**
 * Playwright全局清理
 * 在所有测试运行完成后执行一次
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 开始E2E测试全局清理...');
  
  try {
    // 清理测试数据
    await cleanupTestData();
    
    // 清理测试文件
    await cleanupTestFiles();
    
    console.log('✅ E2E测试全局清理完成');
  } catch (error) {
    console.error('❌ 全局清理失败:', error);
    // 不抛出错误，避免影响测试结果
  }
}

/**
 * 清理测试数据
 */
async function cleanupTestData() {
  console.log('⏳ 清理测试数据...');
  
  try {
    // 获取管理员令牌
    const token = await getAdminToken();
    
    // 清理测试用户（保留系统管理员）
    await cleanupTestUsers(token);
    
    // 清理测试客户端
    await cleanupTestClients(token);
    
    // 清理非内置角色
    await cleanupTestRoles(token);
    
    console.log('✅ 测试数据清理完成');
  } catch (error) {
    console.warn('⚠️ 测试数据清理失败:', error.message);
  }
}

/**
 * 清理测试用户
 */
async function cleanupTestUsers(token: string) {
  const testEmails = [
    'admin@test.com',
    'editor@test.com',
    'viewer@test.com',
    '2fa@test.com',
    'locked@test.com'
  ];
  
  for (const email of testEmails) {
    try {
      // 获取用户ID
      const usersResponse = await fetch(`http://localhost:3001/api/admin/users?search=${email}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        const user = usersData.data.items.find((u: any) => u.email === email);
        
        if (user) {
          // 删除用户
          const deleteResponse = await fetch(`http://localhost:3001/api/admin/users/${user.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (deleteResponse.ok) {
            console.log(`✅ 删除测试用户: ${email}`);
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ 删除用户失败: ${email}`);
    }
  }
}

/**
 * 清理测试客户端
 */
async function cleanupTestClients(token: string) {
  const testClientNames = [
    'Test Web App',
    'Test Mobile App',
    'Test API Client'
  ];
  
  for (const name of testClientNames) {
    try {
      // 获取客户端列表
      const clientsResponse = await fetch(`http://localhost:3001/api/admin/clients?search=${encodeURIComponent(name)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (clientsResponse.ok) {
        const clientsData = await clientsResponse.json();
        const client = clientsData.data.items.find((c: any) => c.name === name);
        
        if (client) {
          // 删除客户端
          const deleteResponse = await fetch(`http://localhost:3001/api/admin/clients/${client.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (deleteResponse.ok) {
            console.log(`✅ 删除测试客户端: ${name}`);
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ 删除客户端失败: ${name}`);
    }
  }
}

/**
 * 清理测试角色（仅清理非内置角色）
 */
async function cleanupTestRoles(token: string) {
  try {
    // 获取角色列表
    const rolesResponse = await fetch('http://localhost:3001/api/admin/roles', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (rolesResponse.ok) {
      const rolesData = await rolesResponse.json();
      const customRoles = rolesData.data.items.filter((role: any) => !role.isBuiltIn);
      
      for (const role of customRoles) {
        try {
          // 删除自定义角色
          const deleteResponse = await fetch(`http://localhost:3001/api/admin/roles/${role.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (deleteResponse.ok) {
            console.log(`✅ 删除自定义角色: ${role.name}`);
          }
        } catch (error) {
          console.warn(`⚠️ 删除角色失败: ${role.name}`);
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ 清理角色失败:', error.message);
  }
}

/**
 * 清理测试文件
 */
async function cleanupTestFiles() {
  console.log('⏳ 清理测试文件...');
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    // 清理测试结果目录
    const testResultsDir = path.join(process.cwd(), 'test-results');
    if (fs.existsSync(testResultsDir)) {
      // 保留最新的测试结果，删除旧的
      const files = fs.readdirSync(testResultsDir);
      const sortedFiles = files
        .map((file: string) => ({
          name: file,
          path: path.join(testResultsDir, file),
          stat: fs.statSync(path.join(testResultsDir, file))
        }))
        .sort((a: any, b: any) => b.stat.mtime.getTime() - a.stat.mtime.getTime());
      
      // 保留最新的5个文件/目录
      const filesToDelete = sortedFiles.slice(5);
      
      for (const file of filesToDelete) {
        try {
          if (file.stat.isDirectory()) {
            fs.rmSync(file.path, { recursive: true, force: true });
          } else {
            fs.unlinkSync(file.path);
          }
          console.log(`✅ 删除旧测试文件: ${file.name}`);
        } catch (error) {
          console.warn(`⚠️ 删除文件失败: ${file.name}`);
        }
      }
    }
    
    // 清理临时上传文件
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'temp');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(uploadsDir, file));
          console.log(`✅ 删除临时文件: ${file}`);
        } catch (error) {
          console.warn(`⚠️ 删除临时文件失败: ${file}`);
        }
      }
    }
    
    console.log('✅ 测试文件清理完成');
  } catch (error) {
    console.warn('⚠️ 测试文件清理失败:', error.message);
  }
}

/**
 * 获取管理员令牌
 */
async function getAdminToken(): Promise<string> {
  try {
    const response = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'system@admin.com',
        password: 'system-admin-password'
      })
    });
    
    if (!response.ok) {
      throw new Error('获取管理员令牌失败');
    }
    
    const data = await response.json();
    return data.data.token;
  } catch (error) {
    throw new Error(`认证失败: ${error.message}`);
  }
}

export default globalTeardown;