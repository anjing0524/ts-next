-- CreateIndex
CREATE INDEX "audit_logs_userId_timestamp_idx" ON "audit_logs"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "oauth_clients_clientId_isActive_idx" ON "oauth_clients"("clientId", "isActive");
