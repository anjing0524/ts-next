// packages/lib/src/utils/misc.ts

/**
 * 从对象中排除一个或多个键。
 * @param obj - 源对象。
 * @param keys - 要排除的键数组。
 * @returns 一个不包含指定键的新对象。
 */
export function exclude<T, Key extends keyof T>(obj: T, keys: Key[]): Omit<T, Key> {
  const newObj = { ...obj };
  for (const key of keys) {
    delete newObj[key];
  }
  return newObj;
}

/**
 * 从用户对象中排除密码哈希字段。
 * 这是一个针对特定场景的便捷函数。
 * @param user - 用户对象。
 * @returns 不包含 'passwordHash' 字段的新用户对象。
 */
export function excludePassword<User>(user: User): Omit<User, 'passwordHash'> {
  // @ts-ignore
  return exclude(user, ['passwordHash']);
}
