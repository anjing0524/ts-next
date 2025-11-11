#!/usr/bin/env node
/**
 * FlatBuffers Schema 编译示例
 * 演示如何使用原始 schema 文件编译生成不同语言的代码
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 获取 schema 文件路径
const schemaPath = require.resolve('@repo/flatbuffers-kline/schemas/kline.fbs');
console.log('Schema 文件路径:', schemaPath);

// 创建输出目录
const outputDir = path.join(__dirname, 'generated');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 编译选项
const compileOptions = [
  { lang: 'ts', desc: 'TypeScript' },
  { lang: 'python', desc: 'Python' },
  { lang: 'java', desc: 'Java' },
  { lang: 'cpp', desc: 'C++' },
  { lang: 'js', desc: 'JavaScript' },
  { lang: 'go', desc: 'Go' },
  { lang: 'rust', desc: 'Rust' }
];

console.log('\n可用的编译选项:');
compileOptions.forEach((option, index) => {
  console.log(`${index + 1}. ${option.desc} (--${option.lang})`);
});

// 获取命令行参数
const args = process.argv.slice(2);
const targetLang = args[0] || 'ts';

// 验证语言选项
const validLangs = compileOptions.map(opt => opt.lang);
if (!validLangs.includes(targetLang)) {
  console.error(`\n❌ 不支持的语言: ${targetLang}`);
  console.error(`支持的语言: ${validLangs.join(', ')}`);
  process.exit(1);
}

try {
  // 执行编译命令
  const command = `flatc --${targetLang} -o ${outputDir} ${schemaPath}`;
  console.log(`\n🔨 执行编译命令: ${command}`);
  
  execSync(command, { stdio: 'inherit' });
  
  console.log(`\n✅ 编译完成! 输出目录: ${outputDir}`);
  console.log('\n生成的文件:');
  
  // 列出生成的文件
  const files = fs.readdirSync(outputDir, { recursive: true });
  files.forEach(file => {
    console.log(`  - ${file}`);
  });
  
} catch (error) {
  console.error('\n❌ 编译失败:', error.message);
  console.error('\n请确保已安装 FlatBuffers 编译器:');
  console.error('  macOS: brew install flatbuffers');
  console.error('  其他系统: https://github.com/google/flatbuffers/releases');
  process.exit(1);
}