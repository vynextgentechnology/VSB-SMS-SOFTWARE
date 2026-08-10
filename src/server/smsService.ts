import axios from 'axios';

export interface Fast2SmsResponse {
  success: boolean;
  data?: any;
  error?: any;
  keyUsed?: string;
  rotatedKey?: boolean;
}

export interface ApiKeyStatus {
  id: number;
  keyMasked: string;
  status: 'active' | 'exhausted' | 'error';
  sendCount: number;
  failCount: number;
  lastUsed?: string;
  lastError?: string;
}

/**
 * Clean phone number to 10-digit format expected by Fast2SMS bulkV2 API.
 * Accepts string or array of strings.
 */
export function formatPhoneNumber(phone: string | string[]): string {
  if (Array.isArray(phone)) {
    return phone
      .map((p) => p.replace(/\D/g, '').slice(-10))
      .filter((p) => p.length === 10)
      .join(',');
  }
  if (phone.includes(',')) {
    return phone
      .split(',')
      .map((p) => p.replace(/\D/g, '').slice(-10))
      .filter((p) => p.length === 10)
      .join(',');
  }
  const clean = phone.replace(/\D/g, '').slice(-10);
  return clean;
}

/**
 * Initialize SMS API Key Pool (5 - 10 keys supported)
 */
function loadApiKeyPool(): string[] {
  const pool: string[] = [];

  // Check FAST2SMS_API_KEYS (comma separated string)
  if (process.env.FAST2SMS_API_KEYS) {
    const list = process.env.FAST2SMS_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
    pool.push(...list);
  }

  // Check FAST2SMS_API_KEY_1 through FAST2SMS_API_KEY_10
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`FAST2SMS_API_KEY_${i}`];
    if (key && key.trim()) {
      pool.push(key.trim());
    }
  }

  // Check FAST2SMS_API_KEY
  if (process.env.FAST2SMS_API_KEY && process.env.FAST2SMS_API_KEY.trim()) {
    pool.push(process.env.FAST2SMS_API_KEY.trim());
  }

  // Default fallbacks if no keys provided
  if (pool.length === 0) {
    pool.push("rnfEAtkN21a3NBtU3LbAPBsIwnmRahHWDn5XiiLWcLBGOtulL9N1Osbu6v8v");
    pool.push("K3L21a3NBtU3LbAPBsIwnmRahHWDn5XiiLWcLBGOtulL9N1Osbu6v8v_KEY2");
    pool.push("PBsIwnmRahHWDn5XiiLWcLBGOtulL9N1Osbu6v8v_KEY3");
  }

  // Deduplicate keys
  return Array.from(new Set(pool));
}

let API_KEY_POOL = loadApiKeyPool();
let currentKeyIndex = 0;

const keyStatsMap: Map<number, ApiKeyStatus> = new Map(
  API_KEY_POOL.map((key, index) => [
    index,
    {
      id: index + 1,
      keyMasked: key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : 'Key-***',
      status: 'active',
      sendCount: 0,
      failCount: 0,
    },
  ])
);

/**
 * Get current SMS API Key rotation status for admin/staff view
 */
export function getSmsApiKeyPoolStatus() {
  return {
    totalKeys: API_KEY_POOL.length,
    activeKeyIndex: currentKeyIndex,
    activeKeyMasked: keyStatsMap.get(currentKeyIndex)?.keyMasked || 'N/A',
    keys: Array.from(keyStatsMap.values()),
  };
}

/**
 * Manually force rotate key index
 */
export function rotateToNextKey(): number {
  currentKeyIndex = (currentKeyIndex + 1) % API_KEY_POOL.length;
  console.log(`[SMS Key Rotation]: Manually rotated to API Key #${currentKeyIndex + 1}`);
  return currentKeyIndex;
}

/**
 * Helper to check if error response indicates key limit or authorization failure
 */
function isKeyLimitOrAuthError(error: any, responseData: any): boolean {
  if (!error && !responseData) return false;

  const msg = (
    (responseData?.message || '') +
    ' ' +
    (typeof error === 'string' ? error : JSON.stringify(error || ''))
  ).toLowerCase();

  return (
    msg.includes('limit') ||
    msg.includes('exceeded') ||
    msg.includes('credit') ||
    msg.includes('balance') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid api key') ||
    msg.includes('quota') ||
    msg.includes('rate') ||
    msg.includes('blocked') ||
    error?.response?.status === 401 ||
    error?.response?.status === 402 ||
    error?.response?.status === 403 ||
    error?.response?.status === 429
  );
}

/**
 * Sends SMS via Fast2SMS API with automatic multi-key rotation upon limit/error
 */
export async function sendSMS(phone: string | string[], message: string): Promise<Fast2SmsResponse> {
  const formattedNumbers = formatPhoneNumber(phone);

  if (!formattedNumbers) {
    console.error('[Fast2SMS Error]: No valid 10-digit mobile number provided.');
    return {
      success: false,
      error: 'Invalid recipient phone number. Fast2SMS requires 10-digit Indian mobile numbers.',
    };
  }

  const initialIndex = currentKeyIndex;
  let attempts = 0;
  const maxAttempts = API_KEY_POOL.length;
  let hasRotated = false;

  while (attempts < maxAttempts) {
    const keyIndex = (initialIndex + attempts) % API_KEY_POOL.length;
    const apiKey = API_KEY_POOL[keyIndex];
    const keyStats = keyStatsMap.get(keyIndex);

    try {
      console.log(`[Fast2SMS Request]: Using Key #${keyIndex + 1} (${keyStats?.keyMasked}) -> Numbers: ${formattedNumbers}`);

      const response = await axios.post(
        'https://www.fast2sms.com/dev/bulkV2',
        {
          route: 'q',
          message: message,
          language: 'english',
          numbers: formattedNumbers,
        },
        {
          headers: {
            authorization: apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      // Check Fast2SMS payload status
      if (response.data && response.data.return === false) {
        const errorMsg = response.data.message || 'Fast2SMS returned false status';
        
        if (keyStats) {
          keyStats.failCount++;
          keyStats.lastError = errorMsg;
          keyStats.lastUsed = new Date().toISOString();
        }

        if (isKeyLimitOrAuthError(errorMsg, response.data)) {
          if (keyStats) keyStats.status = 'exhausted';
          console.warn(`[SMS Key Pool Warning]: Key #${keyIndex + 1} limit/auth error: "${errorMsg}". Rotating to next key...`);
          currentKeyIndex = (keyIndex + 1) % API_KEY_POOL.length;
          hasRotated = true;
          attempts++;
          continue; // Try next key in loop
        }

        return {
          success: false,
          data: response.data,
          error: errorMsg,
          keyUsed: keyStats?.keyMasked,
          rotatedKey: hasRotated,
        };
      }

      // Success! Update stats
      if (keyStats) {
        keyStats.sendCount++;
        keyStats.status = 'active';
        keyStats.lastUsed = new Date().toISOString();
      }

      currentKeyIndex = keyIndex; // Keep active working key

      return {
        success: true,
        data: response.data,
        keyUsed: keyStats?.keyMasked,
        rotatedKey: hasRotated,
      };

    } catch (error: any) {
      const errorDetails = error.response?.data || error.message || 'Unknown network error';
      console.error(`[Fast2SMS API Error on Key #${keyIndex + 1}]:`, errorDetails);

      if (keyStats) {
        keyStats.failCount++;
        keyStats.lastError = typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails);
        keyStats.lastUsed = new Date().toISOString();
      }

      if (isKeyLimitOrAuthError(error, error.response?.data)) {
        if (keyStats) keyStats.status = 'exhausted';
        console.warn(`[SMS Key Pool Warning]: Key #${keyIndex + 1} reached limit or failed. Rotating to key #${((keyIndex + 1) % API_KEY_POOL.length) + 1}...`);
        currentKeyIndex = (keyIndex + 1) % API_KEY_POOL.length;
        hasRotated = true;
        attempts++;
        continue; // Try next key
      }

      return {
        success: false,
        error: errorDetails,
        keyUsed: keyStats?.keyMasked,
        rotatedKey: hasRotated,
      };
    }
  }

  // All keys in pool exhausted
  return {
    success: false,
    error: `All ${API_KEY_POOL.length} SMS API keys in key pool were attempted and failed or reached limits. Please update FAST2SMS_API_KEYS in system configuration.`,
    rotatedKey: true,
  };
}

export default sendSMS;
