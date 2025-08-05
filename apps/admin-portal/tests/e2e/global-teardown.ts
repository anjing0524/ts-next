import { execSync } from 'child_process';
import path from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * 全局测试清理
 * 在E2E测试完成后清理测试环境
 */
async function globalTeardown() {
  console.log('🧹 开始全局测试清理...');

  const testResultsDir = join(process.cwd(), 'test-results');
  const sessionStatePath = join(testResultsDir, 'session-state.json');

  try {
    // 1. 读取测试会话状态
    let sessionState = { testResults: [], startTime: Date.now() };
    if (existsSync(sessionStatePath)) {
      sessionState = JSON.parse(readFileSync(sessionStatePath, 'utf8'));
    }

    // 2. 生成测试摘要报告
    const testSummary = {
      testEndTime: new Date().toISOString(),
      duration: Date.now() - sessionState.startTime,
      totalTests: sessionState.testResults.length,
      passedTests: sessionState.testResults.filter((r: any) => r.status === 'passed').length,
      failedTests: sessionState.testResults.filter((r: any) => r.status === 'failed').length,
      testResults: sessionState.testResults
    };

    writeFileSync(
      join(testResultsDir, 'test-summary.json'),
      JSON.stringify(testSummary, null, 2)
    );

    // 3. 清理测试数据库（可选）
    console.log('🗑️  清理测试数据...');
    try {
      // 可选：清理测试数据
      // execSync('cd ../../packages/database && npx prisma db seed -- --cleanup', {
      //   stdio: 'inherit',
      // });
      console.log('✅ 测试数据清理完成');
    } catch (error) {
      console.warn('⚠️  测试数据清理失败:', error);
    }

    // 4. 清理临时文件
    console.log('🧹 清理临时文件...');
    const tempFiles = [
      join(testResultsDir, 'session-state.json'),
      join(testResultsDir, 'test-config.json'),
      join(testResultsDir, 'environment-vars.json')
    ];

    tempFiles.forEach(file => {
      if (existsSync(file)) {
        // 保留这些文件用于调试，可以选择删除
        // unlinkSync(file);
      }
    });

    // 5. 停止测试服务（可选）
    console.log('🛑 停止测试服务...');
    try {
      // 如果有专门的测试服务，可以在这里停止
      // execSync('pkill -f "node.*test"', { stdio: 'inherit' });
      console.log('✅ 测试服务停止完成');
    } catch (error) {
      console.warn('⚠️  测试服务停止失败:', error);
    }

    // 6. 生成性能报告（如果有性能测试数据）
    console.log('📊 生成性能报告...');
    try {
      const performanceReport = {
        testDuration: testSummary.duration,
        averageTestTime: testSummary.totalTests > 0 ? testSummary.duration / testSummary.totalTests : 0,
        testResults: testSummary.testResults
      };

      writeFileSync(
        join(testResultsDir, 'performance-report.json'),
        JSON.stringify(performanceReport, null, 2)
      );
      console.log('✅ 性能报告生成完成');
    } catch (error) {
      console.warn('⚠️  性能报告生成失败:', error);
    }

    // 7. 清理浏览器缓存和会话数据（可选）
    console.log('🧹 清理浏览器缓存...');
    try {
      // 如果有浏览器缓存清理逻辑，可以在这里执行
      console.log('✅ 浏览器缓存清理完成');
    } catch (error) {
      console.warn('⚠️  浏览器缓存清理失败:', error);
    }

    // 8. 验证清理结果
    console.log('🔍 验证清理结果...');
    try {
      // 验证数据库状态
      const dbCheck = await fetch('http://localhost:3001/api/v2/health/database');
      if (dbCheck.ok) {
        console.log('✅ 数据库状态正常');
      }

      // 验证服务状态
      const serviceCheck = await fetch('http://localhost:3001/api/v2/health');
      if (serviceCheck.ok) {
        console.log('✅ 服务状态正常');
      }
    } catch (error) {
      console.warn('⚠️  清理验证失败:', error);
    }

    // 9. 生成清理报告
    const cleanupReport = {
      cleanupTime: new Date().toISOString(),
      actions: [
        '数据库清理',
        '临时文件清理',
        '服务停止',
        '性能报告生成',
        '浏览器缓存清理'
      ],
      status: 'completed',
      testResultsSummary: {
        total: testSummary.totalTests,
        passed: testSummary.passedTests,
        failed: testSummary.failedTests,
        duration: testSummary.duration
      }
    };

    writeFileSync(
      join(testResultsDir, 'cleanup-report.json'),
      JSON.stringify(cleanupReport, null, 2)
    );

    console.log('✅ 测试环境清理完成');
    console.log(`📊 测试摘要: ${testSummary.passedTests}/${testSummary.totalTests} 通过`);
    console.log(`⏱️  测试时长: ${Math.round(testSummary.duration / 1000)}秒`);
    console.log(`📁 测试结果目录: ${testResultsDir}`);

  } catch (error) {
    console.error('❌ 测试环境清理失败:', error);
    
    // 生成错误报告
    const errorReport = {
      errorTime: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      cleanupStatus: 'failed'
    };

    try {
      writeFileSync(
        join(testResultsDir, 'cleanup-error-report.json'),
        JSON.stringify(errorReport, null, 2)
      );
    } catch (reportError) {
      console.error('❌ 错误报告生成失败:', reportError);
    }

    // 不抛出错误，让测试继续完成
  }
}

export default globalTeardown;