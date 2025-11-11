#!/bin/bash

# ZMQ Logger Client 构建脚本
# 用于构建预编译二进制文件

set -e

echo "🚀 开始构建 ZMQ Logger Client 预编译二进制文件..."

# 检查依赖
echo "📋 检查构建依赖..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js"
    exit 1
fi

# 检查 Rust
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust 未安装，请先安装 Rust"
    exit 1
fi

# 检查 ZMQ 开发库
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if ! pkg-config --exists libzmq; then
        echo "❌ ZMQ 开发库未安装，请运行: sudo apt-get install libzmq3-dev"
        exit 1
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    if ! brew list zeromq &> /dev/null; then
        echo "❌ ZMQ 未安装，请运行: brew install zeromq"
        exit 1
    fi
fi

echo "✅ 依赖检查完成"

# 进入客户端目录
cd packages/zmq-logger-client

# 安装依赖
echo "📦 安装 npm 依赖..."
npm ci

# 构建预编译二进制文件
echo "🔨 构建预编译二进制文件..."
npm run prebuild

# 创建预构建目录
mkdir -p prebuilds

# 移动预编译文件
echo "📂 整理预编译文件..."
find . -name "*.node" -exec cp {} prebuilds/ \;

# 显示构建结果
echo "✅ 构建完成！"
echo "📁 预编译文件位置: packages/zmq-logger-client/prebuilds/"
ls -la prebuilds/

# 测试本地安装
echo "🧪 测试本地安装..."
cd ../..
npm install ./packages/zmq-logger-client --no-save

echo "🎉 所有构建步骤完成！"
echo ""
echo "使用方法:"
echo "1. 将预编译文件上传到 GitHub Release"
echo "2. 在 package.json 中配置:"
echo '   "scripts": {'
echo '     "postinstall": "node -e \\"require(\'child_process\').exec(\'npm run prebuild\')\\"'
echo '   }'
echo "3. 发布到 npm"