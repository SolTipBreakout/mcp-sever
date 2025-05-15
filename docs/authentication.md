# API Key Authentication

This document describes how to use API key authentication with the Solana MCP API.

## Overview

The Solana MCP API uses API key-based authentication to secure endpoints. This allows for simple and effective access control to the API resources. API keys should be treated as sensitive information and should not be exposed in client-side code or public repositories.

## Configuration

API key authentication is configured using environment variables:

```
API_KEYS=key1,key2,key3
API_KEY_HEADER=x-api-key
API_AUTH_ENABLED=true
```

- **API_KEYS**: A comma-separated list of valid API keys. Each key should be unique and sufficiently complex.
- **API_KEY_HEADER**: The HTTP header name to use for the API key (default: `x-api-key`).
- **API_AUTH_ENABLED**: Whether API key authentication is enabled (default: `true` if any API_KEYS are defined).

## Using API Keys

To authenticate API requests, include your API key in the HTTP header specified by `API_KEY_HEADER` (default: `x-api-key`):

```
GET /api/status HTTP/1.1
Host: your-api-host.com
x-api-key: your-api-key-here
```

### Example with curl

```bash
curl -X GET "https://your-api-host.com/api/status" -H "x-api-key: your-api-key-here"
```

### Example with JavaScript

```javascript
fetch('https://your-api-host.com/api/status', {
  headers: {
    'x-api-key': 'your-api-key-here'
  }
})
.then(response => response.json())
.then(data => console.log(data));
```

## Authentication Responses

The API will respond with different status codes based on the authentication result:

- **200 OK**: Request successful (authenticated).
- **401 Unauthorized**: No API key provided when required.
- **403 Forbidden**: Invalid API key provided.

Error response format:

```json
{
  "status": "error",
  "statusCode": 401,
  "message": "API key is required"
}
```

## Optional Authentication

Some endpoints support optional authentication, which provides additional information when authenticated but still allows access when unauthenticated.

For example, the `/api/status` endpoint returns basic status information for unauthenticated requests, but includes additional details for authenticated requests.

## Security Best Practices

1. **Generate Strong Keys**: Use a cryptographically secure method to generate API keys.
2. **Rotate Keys Regularly**: Periodically generate new API keys and invalidate old ones.
3. **Use HTTPS**: Always transmit API keys over HTTPS to prevent interception.
4. **Limit Access**: Only share API keys with authorized users or services.
5. **Environment-Specific Keys**: Use different API keys for development, staging, and production environments.
6. **Monitor Usage**: Log and monitor API key usage to detect potential abuse.

## Request Authorization Flow

1. The client sends a request with an API key in the header.
2. The server extracts the API key from the header.
3. The server validates the API key against the configured list of valid keys.
4. If the key is valid, the request proceeds to the requested endpoint.
5. If the key is invalid or missing, the server responds with an appropriate error. 