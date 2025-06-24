// 导入 Node.js 内置的 crypto 模块，用于生成安全的随机数，例如用于密码生成。
import crypto from 'crypto';

// 导入 bcrypt 库，用于密码哈希和比较。bcrypt 是一种强大的密码哈希算法，能有效抵抗暴力破解。
import * as bcrypt from 'bcrypt';
// 导入 zod 库，用于数据验证，如此处用于定义和验证密码复杂度规则。
import { z } from 'zod';

// 导入共享的 Prisma 客户端实例，用于与数据库交互，例如查询密码历史记录。
import { prisma } from '@repo/database/client';

// 定义密码的最小长度常量。
const PASSWORD_MIN_LENGTH = 8;
// 定义允许的特殊字符集常量。
const SPECIAL_CHARACTERS = '!@#$%^&*()_+-=[]{};:\'",.<>/?`~';
// 定义允许的数字字符集常量。
const NUMBER_CHARACTERS = '0123456789';
// 定义允许的小写字母字符集常量。
const LOWERCASE_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz';
// 定义允许的大写字母字符集常量。
const UPPERCASE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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
export const PasswordComplexitySchema = z
  .string() // 输入必须是字符串
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`) // 最小长度验证
  .refine((password) => { // 自定义验证逻辑 (refine)
    // 定义四种字符类别及其对应的正则表达式
    const categories = [
      /[a-z]/, // 匹配小写字母
      /[A-Z]/, // 匹配大写字母
      /[0-9]/, // 匹配数字
      // 匹配特殊字符。需要对 `SPECIAL_CHARACTERS` 字符串中的特殊正则表达式字符进行转义。
      new RegExp(`[${SPECIAL_CHARACTERS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`),
    ];
    let satisfiedCategories = 0; // 记录满足条件的字符类别数量
    // 遍历每个类别，检查密码是否包含该类别的字符
    for (const category of categories) {
      if (category.test(password)) {
        satisfiedCategories++; // 如果包含，则计数器加一
      }
    }
    // 密码必须满足至少两个字符类别的要求
    return satisfiedCategories >= 2;
  }, 'Password must contain characters from at least two of the following categories: uppercase letters, lowercase letters, numbers, and special characters.'); // 如果不满足条件，则返回此错误消息

/**
 * 生成一个符合预定义复杂度要求的安全密码。
 * @param length - (可选) 生成密码的期望长度，默认为12。如果小于 `PASSWORD_MIN_LENGTH`，则使用 `PASSWORD_MIN_LENGTH`。
 * @returns 返回生成的随机密码字符串。
 * @security 安全考虑: 使用 `crypto.randomInt` 生成随机索引以选择字符，确保密码的随机性。
 *           确保密码包含多种字符类型，并打乱顺序，以增加破解难度。
 */
export function generateSecurePassword(length: number = 12): string {
  // 确保密码长度不小于定义的最小长度
  if (length < PASSWORD_MIN_LENGTH) {
    length = PASSWORD_MIN_LENGTH;
  }

  // 构建包含所有允许字符类型的完整字符集
  const allChars =
    LOWERCASE_CHARACTERS + UPPERCASE_CHARACTERS + NUMBER_CHARACTERS + SPECIAL_CHARACTERS;

  let password = ''; // 初始化空密码字符串

  // --- 确保密码至少包含两种不同类型的字符 ---
  // 为了简单起见，这里确保至少包含一个小写字母和一个数字，以满足“至少两类字符”的要求。
  // 更健壮的生成器可能会随机选择这两个强制类别，或确保更多类别。
  password += LOWERCASE_CHARACTERS[crypto.randomInt(LOWERCASE_CHARACTERS.length)]; // 添加一个随机小写字母
  password += NUMBER_CHARACTERS[crypto.randomInt(NUMBER_CHARACTERS.length)];     // 添加一个随机数字

  // 如果在添加强制字符后，密码长度仍然小于2 (例如，如果期望长度 length 非常小)，则调整 length。
  // (这种情况在 `length >= PASSWORD_MIN_LENGTH` 的前提下不太可能发生，但作为防御性编程)
  if (length < 2) length = 2;

  // --- 填充剩余长度的密码字符 ---
  // 从包含所有类型字符的 `allChars` 字符串中随机选择字符，直到达到期望的长度。
  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  // --- 打乱密码字符顺序 ---
  // 将生成的密码字符串转换为字符数组，随机排序，然后再合并回字符串。
  // 这是为了确保初始添加的强制类别字符 (小写字母和数字) 不会总是在密码的固定位置。
  password = password
    .split('') // 转为字符数组
    .sort(() => 0.5 - Math.random()) // 使用随机排序函数打乱数组
    .join(''); // 合并回字符串

  // --- 验证生成的密码是否符合复杂度要求 ---
  // 这是一个额外的检查步骤。对于当前的生成逻辑，它应该总是能通过。
  // 如果由于某种原因（例如生成逻辑的缺陷或复杂度规则的变更）导致生成的密码不符合要求，
  // 此处会捕获错误并尝试使用一个更简单的回退逻辑重新生成。
  try {
    PasswordComplexitySchema.parse(password); // 使用 Zod Schema 验证密码
    return password; // 如果验证通过，返回密码
  } catch (e) {
    // 如果上面生成的密码未能通过 PasswordComplexitySchema 的验证 (理论上不太可能发生)
    console.error("Error validating initially generated password:", e); // 记录错误
    console.warn(
      'Initial generated password failed complexity check, retrying with simpler fallback logic for safety.'
    );
    // --- 回退密码生成逻辑 ---
    // 这种回退逻辑旨在确保在极端情况下也能生成一个密码，尽管可能不如预期复杂。
    // 理想情况下，应该循环调用主生成逻辑直到生成有效密码。
    let fallbackPassword = '';
    const charSets = [ // 定义字符集数组
      LOWERCASE_CHARACTERS,
      UPPERCASE_CHARACTERS,
      NUMBER_CHARACTERS,
      SPECIAL_CHARACTERS,
    ];
    // 确保至少一个小写字母和一个数字
    fallbackPassword += charSets[0]![crypto.randomInt(charSets[0]!.length)];
    fallbackPassword += charSets[2]![crypto.randomInt(charSets[2]!.length)];
    // 填充剩余长度
    for (let i = 2; i < length; i++) {
      fallbackPassword += allChars[crypto.randomInt(allChars.length)];
    }
    // 再次打乱
    return fallbackPassword
      .split('')
      .sort(() => 0.5 - Math.random())
      .join('');
  }
}

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
export async function checkPasswordHistory(
  userId: string,               // 用户ID
  newPasswordRaw: string,       // 新的明文密码
  historyLimit: number = 5      // 检查最近多少条历史记录，默认为5
): Promise<boolean> {
  // 从数据库中查询指定用户的密码历史记录。
  // 按创建时间降序排序，并只取最近的 `historyLimit` 条记录。
  const passwordHistory = await prisma.passwordHistory.findMany({
    where: { userId },              // 根据用户ID筛选
    orderBy: { createdAt: 'desc' }, // 按创建时间倒序排列
    take: historyLimit,             // 获取最新的 N 条记录
  });

  // 如果没有密码历史记录，则新密码自然是有效的 (从历史角度看)。
  if (passwordHistory.length === 0) {
    return true;
  }

  // 遍历获取到的密码历史记录
  for (const record of passwordHistory) {
    // 将用户提供的新明文密码与数据库中存储的哈希密码进行比较。
    // record.passwordHash 是之前存储的、使用 bcrypt 哈希过的密码。
    const matches = await bcrypt.compare(newPasswordRaw, record.passwordHash);
    if (matches) {
      // 如果新密码与历史记录中的某个密码匹配，则验证失败。
      return false; // 密码与近期历史记录中的一个匹配
    }
  }
  // 如果新密码与所有检查的历史记录都不匹配，则验证通过。
  return true; // 密码未在近期历史记录中找到
}

/**
 * bcrypt 哈希算法的盐轮数 (Salt Rounds)。
 * 这个值决定了哈希密码的计算成本。值越高，哈希过程越慢，从而使暴力破解更困难。
 * 一般推荐值为 10 到 12。增加此值会增加服务器的 CPU 负载。
 * @security 安全考虑: 适当的盐轮数对于密码哈希的强度至关重要。
 *           不应使用过低的值 (例如 < 10)。需要根据服务器性能和安全需求进行权衡。
 */
export const SALT_ROUNDS = 10; // 标准化盐轮数，通常10-12是一个好的平衡点。
