import crypto from 'crypto';

import * as bcrypt from 'bcrypt';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';

const PASSWORD_MIN_LENGTH = 8;
const SPECIAL_CHARACTERS = '!@#$%^&*()_+-=[]{};:\'",.<>/?`~';
const NUMBER_CHARACTERS = '0123456789';
const LOWERCASE_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const PasswordComplexitySchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`)
  .refine((password) => {
    const categories = [
      /[a-z]/, // lowercase
      /[A-Z]/, // uppercase
      /[0-9]/, // numbers
      new RegExp(`[${SPECIAL_CHARACTERS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`), // special characters
    ];
    let satisfiedCategories = 0;
    for (const category of categories) {
      if (category.test(password)) {
        satisfiedCategories++;
      }
    }
    return satisfiedCategories >= 2;
  }, 'Password must contain characters from at least two of the following categories: uppercase letters, lowercase letters, numbers, and special characters.');

export function generateSecurePassword(length: number = 12): string {
  if (length < PASSWORD_MIN_LENGTH) {
    length = PASSWORD_MIN_LENGTH;
  }

  const allChars =
    LOWERCASE_CHARACTERS + UPPERCASE_CHARACTERS + NUMBER_CHARACTERS + SPECIAL_CHARACTERS;

  let password = '';
  // Ensure at least one character from each of two categories initially
  // For simplicity, we'll ensure one lowercase and one number to meet the "at least two categories"
  // A more robust generator might pick categories randomly.

  password += LOWERCASE_CHARACTERS[crypto.randomInt(LOWERCASE_CHARACTERS.length)];
  password += NUMBER_CHARACTERS[crypto.randomInt(NUMBER_CHARACTERS.length)];

  // If length is less than 2 after adding mandatory chars, adjust
  if (length < 2) length = 2;

  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  // Shuffle the password to make the position of guaranteed characters random
  password = password
    .split('')
    .sort(() => 0.5 - Math.random())
    .join('');

  // Validate if generated password meets complexity, regenerate if not (rare case for this generator)
  try {
    PasswordComplexitySchema.parse(password);
    return password;
  } catch (e) {
    // Fallback to a simpler generation if somehow the above fails complexity, though unlikely
    // Or, ideally, loop until a valid one is generated. For now, simple fallback.
    console.warn(
      'Initial generated password failed complexity check, retrying with simpler logic for safety.'
    );
    let fallbackPassword = '';
    const charSets = [
      LOWERCASE_CHARACTERS,
      UPPERCASE_CHARACTERS,
      NUMBER_CHARACTERS,
      SPECIAL_CHARACTERS,
    ];
    fallbackPassword += charSets[0][crypto.randomInt(charSets[0].length)]; // one lowercase
    fallbackPassword += charSets[2][crypto.randomInt(charSets[2].length)]; // one number
    for (let i = 2; i < length; i++) {
      fallbackPassword += allChars[crypto.randomInt(allChars.length)];
    }
    return fallbackPassword
      .split('')
      .sort(() => 0.5 - Math.random())
      .join('');
  }
}

export async function checkPasswordHistory(
  userId: string,
  newPasswordRaw: string,
  historyLimit: number = 5
): Promise<boolean> {
  const passwordHistory = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: historyLimit,
  });

  if (passwordHistory.length === 0) {
    return true; // No history, so password is valid from history perspective
  }

  for (const record of passwordHistory) {
    const matches = await bcrypt.compare(newPasswordRaw, record.passwordHash);
    if (matches) {
      return false; // Password matches a previous one
    }
  }
  return true; // Password does not match any in recent history
}

export const SALT_ROUNDS = 10; // Standardize salt rounds
