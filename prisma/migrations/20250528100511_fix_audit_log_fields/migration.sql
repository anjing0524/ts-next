/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `AccessToken` ADD COLUMN `jti` VARCHAR(191) NULL,
    ADD COLUMN `revoked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `revokedAt` DATETIME(3) NULL,
    ADD COLUMN `tokenHash` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `AuthorizationCode` ADD COLUMN `authTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `maxAge` INTEGER NULL,
    ADD COLUMN `nonce` VARCHAR(191) NULL,
    ADD COLUMN `state` VARCHAR(191) NULL,
    ADD COLUMN `used` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Client` ADD COLUMN `clientSecretExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `clientUri` VARCHAR(191) NULL,
    ADD COLUMN `description` VARCHAR(191) NULL,
    ADD COLUMN `grantTypes` VARCHAR(191) NOT NULL DEFAULT 'authorization_code',
    ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `isPublic` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `logoUri` VARCHAR(191) NULL,
    ADD COLUMN `policyUri` VARCHAR(191) NULL,
    ADD COLUMN `postLogoutRedirectUris` VARCHAR(191) NULL,
    ADD COLUMN `requireConsent` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `requirePkce` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `responseTypes` VARCHAR(191) NOT NULL DEFAULT 'code',
    ADD COLUMN `scope` VARCHAR(191) NULL,
    ADD COLUMN `tokenEndpointAuthMethod` VARCHAR(191) NOT NULL DEFAULT 'client_secret_basic',
    ADD COLUMN `tosUri` VARCHAR(191) NULL,
    MODIFY `clientSecret` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Permission` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `RefreshToken` ADD COLUMN `accessTokenId` VARCHAR(191) NULL,
    ADD COLUMN `revoked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `revokedAt` DATETIME(3) NULL,
    ADD COLUMN `scope` VARCHAR(191) NULL,
    ADD COLUMN `tokenHash` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Resource` ADD COLUMN `apiPath` VARCHAR(191) NULL,
    ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `email` VARCHAR(191) NULL,
    ADD COLUMN `emailVerificationToken` VARCHAR(191) NULL,
    ADD COLUMN `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `firstName` VARCHAR(191) NULL,
    ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
    ADD COLUMN `lastName` VARCHAR(191) NULL,
    ADD COLUMN `passwordResetToken` VARCHAR(191) NULL,
    ADD COLUMN `passwordResetTokenExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `twoFactorEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `twoFactorSecret` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `UserResourcePermission` ADD COLUMN `expiresAt` DATETIME(3) NULL,
    ADD COLUMN `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `grantedBy` VARCHAR(191) NULL,
    ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `UserSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `lastActivity` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `UserSession_sessionId_key`(`sessionId`),
    INDEX `UserSession_userId_idx`(`userId`),
    INDEX `UserSession_sessionId_idx`(`sessionId`),
    INDEX `UserSession_isActive_idx`(`isActive`),
    INDEX `UserSession_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `resource` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `success` BOOLEAN NOT NULL,
    `errorMessage` TEXT NULL,
    `metadata` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_userId_idx`(`userId`),
    INDEX `AuditLog_clientId_idx`(`clientId`),
    INDEX `AuditLog_action_idx`(`action`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    INDEX `AuditLog_success_idx`(`success`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Scope` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isPublic` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Scope_name_key`(`name`),
    INDEX `Scope_name_idx`(`name`),
    INDEX `Scope_isActive_idx`(`isActive`),
    INDEX `Scope_isDefault_idx`(`isDefault`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsentGrant` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `revoked` BOOLEAN NOT NULL DEFAULT false,
    `revokedAt` DATETIME(3) NULL,

    INDEX `ConsentGrant_userId_idx`(`userId`),
    INDEX `ConsentGrant_clientId_idx`(`clientId`),
    INDEX `ConsentGrant_revoked_idx`(`revoked`),
    UNIQUE INDEX `ConsentGrant_userId_clientId_key`(`userId`, `clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `AccessToken_token_idx` ON `AccessToken`(`token`);

-- CreateIndex
CREATE INDEX `AccessToken_tokenHash_idx` ON `AccessToken`(`tokenHash`);

-- CreateIndex
CREATE INDEX `AccessToken_expiresAt_idx` ON `AccessToken`(`expiresAt`);

-- CreateIndex
CREATE INDEX `AccessToken_revoked_idx` ON `AccessToken`(`revoked`);

-- CreateIndex
CREATE INDEX `AuthorizationCode_code_idx` ON `AuthorizationCode`(`code`);

-- CreateIndex
CREATE INDEX `AuthorizationCode_expiresAt_idx` ON `AuthorizationCode`(`expiresAt`);

-- CreateIndex
CREATE INDEX `Client_clientId_idx` ON `Client`(`clientId`);

-- CreateIndex
CREATE INDEX `Client_isActive_idx` ON `Client`(`isActive`);

-- CreateIndex
CREATE INDEX `Permission_name_idx` ON `Permission`(`name`);

-- CreateIndex
CREATE INDEX `Permission_isActive_idx` ON `Permission`(`isActive`);

-- CreateIndex
CREATE INDEX `RefreshToken_token_idx` ON `RefreshToken`(`token`);

-- CreateIndex
CREATE INDEX `RefreshToken_tokenHash_idx` ON `RefreshToken`(`tokenHash`);

-- CreateIndex
CREATE INDEX `RefreshToken_expiresAt_idx` ON `RefreshToken`(`expiresAt`);

-- CreateIndex
CREATE INDEX `RefreshToken_revoked_idx` ON `RefreshToken`(`revoked`);

-- CreateIndex
CREATE INDEX `Resource_name_idx` ON `Resource`(`name`);

-- CreateIndex
CREATE INDEX `Resource_isActive_idx` ON `Resource`(`isActive`);

-- CreateIndex
CREATE UNIQUE INDEX `User_email_key` ON `User`(`email`);

-- CreateIndex
CREATE INDEX `User_email_idx` ON `User`(`email`);

-- CreateIndex
CREATE INDEX `User_username_idx` ON `User`(`username`);

-- CreateIndex
CREATE INDEX `User_isActive_idx` ON `User`(`isActive`);

-- CreateIndex
CREATE INDEX `UserResourcePermission_userId_idx` ON `UserResourcePermission`(`userId`);

-- CreateIndex
CREATE INDEX `UserResourcePermission_isActive_idx` ON `UserResourcePermission`(`isActive`);

-- CreateIndex
CREATE INDEX `UserResourcePermission_expiresAt_idx` ON `UserResourcePermission`(`expiresAt`);

-- AddForeignKey
ALTER TABLE `UserSession` ADD CONSTRAINT `UserSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `AccessToken` RENAME INDEX `AccessToken_clientId_fkey` TO `AccessToken_clientId_idx`;

-- RenameIndex
ALTER TABLE `AccessToken` RENAME INDEX `AccessToken_userId_fkey` TO `AccessToken_userId_idx`;

-- RenameIndex
ALTER TABLE `AuthorizationCode` RENAME INDEX `AuthorizationCode_clientId_fkey` TO `AuthorizationCode_clientId_idx`;

-- RenameIndex
ALTER TABLE `AuthorizationCode` RENAME INDEX `AuthorizationCode_userId_fkey` TO `AuthorizationCode_userId_idx`;

-- RenameIndex
ALTER TABLE `RefreshToken` RENAME INDEX `RefreshToken_clientId_fkey` TO `RefreshToken_clientId_idx`;

-- RenameIndex
ALTER TABLE `RefreshToken` RENAME INDEX `RefreshToken_userId_fkey` TO `RefreshToken_userId_idx`;

-- RenameIndex
ALTER TABLE `UserResourcePermission` RENAME INDEX `UserResourcePermission_permissionId_fkey` TO `UserResourcePermission_permissionId_idx`;

-- RenameIndex
ALTER TABLE `UserResourcePermission` RENAME INDEX `UserResourcePermission_resourceId_fkey` TO `UserResourcePermission_resourceId_idx`;
