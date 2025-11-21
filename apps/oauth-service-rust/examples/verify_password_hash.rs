// 密码哈希验证工具
// 用于验证SQL中的bcrypt哈希是否对应admin123

use bcrypt::{hash, verify, DEFAULT_COST};

fn main() {
    let password = "admin123";
    
    // 002_seed_data.sql 中的哈希
    let hash_002 = "$2b$12$RpakPpV3Dqfmv7bKS/Fa1O0dGaA1O.n8OY5uAWd6GVDIWvdb0pkqu";
    
    // 004_clean_initialization.sql 中的哈希
    let hash_004 = "$2b$12$YvvLFd.jEPSIpd3f1sWFpuJTCiJhMkHUqEGpKxp5Gkk5ooVEFUNBW";
    
    println!("🔐 密码哈希验证工具");
    println!("=====================");
    println!("");
    println!("测试密码: {}", password);
    println!("");
    
    // 验证002哈希
    println!("验证 002_seed_data.sql 中的哈希:");
    println!("  {}", hash_002);
    match verify(password, hash_002) {
        Ok(valid) => {
            if valid {
                println!("  ✅ 匹配！这个哈希对应 admin123");
            } else {
                println!("  ❌ 不匹配");
            }
        }
        Err(e) => println!("  ❌ 验证错误: {}", e),
    }
    println!("");
    
    // 验证004哈希
    println!("验证 004_clean_initialization.sql 中的哈希:");
    println!("  {}", hash_004);
    match verify(password, hash_004) {
        Ok(valid) => {
            if valid {
                println!("  ✅ 匹配！这个哈希对应 admin123");
            } else {
                println!("  ❌ 不匹配");
            }
        }
        Err(e) => println!("  ❌ 验证错误: {}", e),
    }
    println!("");
    
    // 生成新的标准哈希
    println!("生成新的标准哈希（cost=12）...");
    match hash(password, 12) {
        Ok(new_hash) => {
            println!("  新哈希: {}", new_hash);
            println!("");
            println!("建议:");
            println!("  使用以上任一有效哈希统一所有SQL文件");
        }
        Err(e) => println!("  ❌ 生成失败: {}", e),
    }
}
