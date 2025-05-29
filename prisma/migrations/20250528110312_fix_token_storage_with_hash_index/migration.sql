/*
  Warnings:

  - A unique constraint covering the columns `[tokenHash]` on the table `AccessToken` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tokenHash]` on the table `RefreshToken` will be added. If there are existing duplicate values, this will fail.
  - Made the column `tokenHash` on table `AccessToken` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tokenHash` on table `RefreshToken` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX `AccessToken_token_idx` ON `AccessToken`;

-- DropIndex
DROP INDEX `AccessToken_token_key` ON `AccessToken`;

-- DropIndex
DROP INDEX `RefreshToken_token_idx` ON `RefreshToken`;

-- DropIndex
DROP INDEX `RefreshToken_token_key` ON `RefreshToken`;

-- AlterTable
ALTER TABLE `AccessToken` MODIFY `token` TEXT NOT NULL,
    MODIFY `scope` TEXT NULL,
    MODIFY `tokenHash` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `AuthorizationCode` MODIFY `redirectUri` TEXT NOT NULL,
    MODIFY `scope` TEXT NULL,
    MODIFY `codeChallenge` TEXT NULL,
    MODIFY `state` TEXT NULL;

-- AlterTable
ALTER TABLE `Client` MODIFY `redirectUris` TEXT NOT NULL,
    MODIFY `description` TEXT NULL,
    MODIFY `grantTypes` TEXT NOT NULL,
    MODIFY `postLogoutRedirectUris` TEXT NULL,
    MODIFY `responseTypes` TEXT NOT NULL,
    MODIFY `scope` TEXT NULL;

-- AlterTable
ALTER TABLE `RefreshToken` MODIFY `token` TEXT NOT NULL,
    MODIFY `scope` TEXT NULL,
    MODIFY `tokenHash` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `AccessToken_tokenHash_key` ON `AccessToken`(`tokenHash`);

-- CreateIndex
CREATE UNIQUE INDEX `RefreshToken_tokenHash_key` ON `RefreshToken`(`tokenHash`);
