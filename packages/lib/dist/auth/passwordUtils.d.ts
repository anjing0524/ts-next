import { z } from 'zod';
/**
 * 使用 Zod 定义密码复杂度的验证模式 (Schema)。
 * 规则:
 * 1. 最小长度: 密码长度必须至少为 `PASSWORD_MIN_LENGTH` (当前为8) 个字符。
 * 2. 字符类别: 密码必须包含以下至少两类字符：
 *    - 小写字母 (a-z)
 *    - 大写字母 (A-Z)
 *    - 数字 (0-9)
 *    - 特殊字符 (从 `SPECIAL_CHARACTERS` 常量中定义的字符集)
 * @security 安全考虑: 这些复杂度规则旨在增强密码的强度，使其更难被猜测或破解。
 *           强制使用多种字符类别可以显著增加密码的熵。
 */
export declare const PasswordComplexitySchema: z.ZodEffects<z.ZodString, string, string>;
/**
 * 生成一个符合预定义复杂度要求的安全密码。
 * @param length - (可选) 生成密码的期望长度，默认为12。如果小于 `PASSWORD_MIN_LENGTH`，则使用 `PASSWORD_MIN_LENGTH`。
 * @returns 返回生成的随机密码字符串。
 * @security 安全考虑: 使用 `crypto.randomInt` 生成随机索引以选择字符，确保密码的随机性。
 *           确保密码包含多种字符类型，并打乱顺序，以增加破解难度。
 */
export declare function generateSecurePassword(length?: number): string;
/**
 * 检查新密码是否在用户的近期密码历史中已存在 (防止密码重用)。
 * @param userId - 用户的ID。
 * @param newPasswordRaw - 用户提供的新原始密码 (未哈希)。
 * @param historyLimit - (可选) 要检查的近期密码历史记录数量，默认为5。
 * @returns 返回一个 Promise<boolean>。如果新密码与近期历史密码之一匹配，则返回 `false` (表示不应使用此密码)；
 *          否则返回 `true` (表示密码在历史记录方面有效)。
 * @security 安全考虑: 防止密码重用是重要的安全实践。如果攻击者获取了一个旧密码，
 *           此机制可以阻止他们使用该旧密码重新访问账户 (如果用户已更改密码)。
 */
export declare function checkPasswordHistory(userId: string, // 用户ID
newPasswordRaw: string, // 新的明文密码
historyLimit?: number): Promise<boolean>;
/**
 * bcrypt 哈希算法的盐轮数 (Salt Rounds)。
 * 这个值决定了哈希密码的计算成本。值越高，哈希过程越慢，从而使暴力破解更困难。
 * 一般推荐值为 10 到 12。增加此值会增加服务器的 CPU 负载。
 * @security 安全考虑: 适当的盐轮数对于密码哈希的强度至关重要。
 *           不应使用过低的值 (例如 < 10)。需要根据服务器性能和安全需求进行权衡。
 */
export declare const SALT_ROUNDS = 10;
//# sourceMappingURL=passwordUtils.d.ts.map