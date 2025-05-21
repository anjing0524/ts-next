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

# 编译为WebAssembly
wasm-pack build --target web --out-dir pkg --release 

# 创建public/wasm-cal目录（如果不存在）
mkdir -p ../public/wasm-cal

# 复制编译后的文件到public目录
cp -r pkg/* ../public/wasm-cal/

echo "WebAssembly module built successfully!"