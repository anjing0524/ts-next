#!/bin/bash

# 编译WebAssembly模块
echo "Building WebAssembly module..."

# 检查wasm-pack是否安装
if ! command -v wasm-pack &> /dev/null; then
    echo "wasm-pack not found, installing..."
    cargo install wasm-pack
fi

# 确保当前目录是wasm-cal
cd "$(dirname "$0")"

# 格式化代码
cargo fmt

# 定义输出目录
PKG_DIR="./pkg"
# 定义最终目标公共目录 (相对于项目根目录)
PUBLIC_DEST_DIR="../public/wasm-cal"

# 编译为WebAssembly，输出到本地pkg目录
wasm-pack build --target web --out-dir $PKG_DIR --release 

echo "WebAssembly module built successfully into $PKG_DIR directory!"

# 创建目标公共目录（如果不存在）
mkdir -p $PUBLIC_DEST_DIR

# 将pkg目录的内容复制到公共目录
echo "Copying WASM artifacts to $PUBLIC_DEST_DIR..."
cp -r $PKG_DIR/* $PUBLIC_DEST_DIR/

echo "WASM artifacts are ready in the public directory."