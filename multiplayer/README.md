# Testing locally

To test with local backups, use `.env` vars;

```
ENVIRONMENT=local
```

To test locally with backups to staging enabled, use;

```
PROJECT_BACKUP_S3_BUCKET=[s3-bucket]
PROJECT_BACKUP_S3_KEY=[s3-key]
```

To test locally with a backup, use;

```
LOCAL_BACKUP_NAME=[some/name/dev]
LOCAL_BACKUP_FILENAME=multiplayer/backups/[backup]
```

Where `LOCAL_BACKUP_FILENAME` is a backup
