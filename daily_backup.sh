#!/bin/bash
# =======================================================
# SWANG.IT DAILY DATABASE BACKUP SCRIPT (7-DAY RETENTION)
# =======================================================
# 1. Creates backup with Date in the name (e.g., backup_2026-02-02_Monday.sql)
# 2. Automatically deletes backups older than 7 days.
# =======================================================
# 1. Configuration
BACKUP_DIR="/opt/vcapp/backups"
DB_USER="vcapp_user"
DB_PASS="martina123"
DB_NAME="vcapp"
# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"
# 2. Generate Filename Limit (Date + Day)
# Output Example: backup_2026-02-02_Monday.sql
DATE_TAG=$(date +%F_%A)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
FILEPATH="$BACKUP_DIR/backup_$DATE_TAG.sql"
echo "[$TIMESTAMP] Starting Maintenance..."
# 3. Clean Setup: Delete backups older than 7 days
# This ensures you never have more than ~7-8 files filling the disk.
find "$BACKUP_DIR" -type f -name "backup_*.sql" -mtime +7 -delete
echo "[$TIMESTAMP] ✓ Old backups cleaned."
# 4. Create New Backup
echo "[$TIMESTAMP] Creating backup: $FILEPATH"
# Run mysqldump
mysqldump --no-tablespaces -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$FILEPATH"
# 5. Verification Check
if [ $? -eq 0 ]; then
    echo "[$TIMESTAMP] ✅ SUCCESS: Backup saved."
else
    echo "[$TIMESTAMP] ❌ ERROR: Backup failed!"
    exit 1
fi