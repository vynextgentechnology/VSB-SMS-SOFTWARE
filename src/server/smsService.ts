import axios from 'axios';

export interface Fast2SmsResponse {
  success: boolean;
  data?: any;
  error?: any;
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

// Fast2SMS API Key directly configured in backend
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || "rnfEAtkN21a3NBtU3LbAPBsIwnmRahHWDn5XiiLWcLBGOtulL9N1Osbu6v8v";

/**
 * Sends SMS via Fast2SMS bulkV2 API using FAST2SMS_API_KEY
 */
export async function sendSMS(phone: string | string[], message: string): Promise<Fast2SmsResponse> {
  const apiKey = FAST2SMS_API_KEY;

  const formattedNumbers = formatPhoneNumber(phone);

  if (!formattedNumbers) {
    console.error('[Fast2SMS Error]: No valid 10-digit mobile number provided.');
    return {
      success: false,
      error: 'Invalid recipient phone number. Fast2SMS requires 10-digit Indian mobile numbers.',
    };
  }

  try {
    console.log(`[Fast2SMS Request]: Dispatching to numbers: ${formattedNumbers}`);

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
      }
    );

    console.log('[Fast2SMS Success Response]:', response.data);

    // Fast2SMS returns return: true / return: false in their payload
    if (response.data && response.data.return === false) {
      return {
        success: false,
        data: response.data,
        error: response.data.message || 'Fast2SMS returned false status',
      };
    }

    return {
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    const errorDetails = error.response?.data || error.message || 'Unknown network error';
    console.error('[Fast2SMS API Error]:', errorDetails);

    return {
      success: false,
      error: errorDetails,
    };
  }
}

export default sendSMS;
