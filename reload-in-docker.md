# Reload Node in Docker n8n

If you're loading this node from a local folder in Docker and seeing cached/old versions, try these steps:

## Option 1: Restart Docker Container (Quick)
```bash
# Restart your n8n container
docker restart <container-name>
# or if using docker-compose
docker-compose restart
```

## Option 2: Clear n8n Cache (Better)
```bash
# Stop the container
docker stop <container-name>

# Remove the container (keeps volumes)
docker rm <container-name>

# Start fresh
docker-compose up -d
# or your docker run command
```

## Option 3: Verify Volume Mount
If you're using a volume mount like `-v /path/to/n8n-nodes-civicrm:/data/custom-nodes/n8n-nodes-civicrm`:

1. Make sure the path points to THIS directory
2. Verify the dist folder is being mounted:
```bash
docker exec <container-name> ls -la /data/custom-nodes/n8n-nodes-civicrm/dist/credentials/
docker exec <container-name> cat /data/custom-nodes/n8n-nodes-civicrm/dist/credentials/CiviCrmApi.credentials.js | grep baseURL
```

## Option 4: Check n8n Custom Nodes Path
If using `N8N_CUSTOM_EXTENSION_ENV` environment variable:

```bash
# Check what path n8n is using
docker exec <container-name> env | grep N8N_CUSTOM

# Verify the file exists in that path
docker exec <container-name> ls -la <custom-path>/dist/credentials/
```

## Option 5: Force Rebuild and Reload
```bash
# In this directory, clean and rebuild
npm run build

# If using npm link
npm link

# Then restart n8n container
docker restart <container-name>
```

## Verify the Fix
After restarting, check if the error is gone. The built file should have:
```javascript
baseURL: '={{ $credentials.baseUrl }}',
```

NOT:
```javascript
baseURL: '={{ $credentials.baseUrl.replace(/\\/$/, "") }}',
```
