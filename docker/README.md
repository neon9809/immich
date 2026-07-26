> [!CAUTION]
> Make sure to use the docker-compose.yml of the current release:
> https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml
> 
> The compose file on main may not be compatible with the latest release.

## AI Face Retouch (Volcengine FacePretty)

To enable the AI face retouch button in the photo viewer, add these environment variables to your `.env`:

```ini
IMMICH_VOLCENGINE_ACCESS_KEY_ID=your_access_key_id
IMMICH_VOLCENGINE_SECRET_ACCESS_KEY=your_secret_access_key
```

Get your keys from [https://console.volcengine.com/iam/keymanage/](https://console.volcengine.com/iam/keymanage/).

If these are not set, the button will show a "not configured" error when clicked.

Processed images are saved to a `已处理` subfolder next to the original photo and automatically registered as new assets in Immich.
